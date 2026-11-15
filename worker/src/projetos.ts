// Projetos com ciclo de marcos: GDD → marco 1 → integrador monta o jogo → memória → marco 2 … até o GDD ser coberto.
import type { Env } from "./env";
import { cfg } from "./config";
import { avisar } from "./telegram";
import { apiDoMotor, lerArquivo, lerDoGitHub, salvarNoGitHub } from "./assets";

const SECAO = 12_000, MEMORIA_MAX = 20_000;
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.pdf$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "projeto";

export async function criarProjeto(env: Env, nome: string, gdd: string): Promise<number> {
  const p = await env.DB.prepare("INSERT INTO projetos (nome, slug, gdd) VALUES (?, ?, ?) RETURNING id").bind(nome, slugify(nome), gdd.slice(0, 60_000)).first<{ id: number }>();
  await avisar(env, `🎮 Projeto "${nome}" criado a partir do GDD. A equipe vai trabalhar em marcos (até 6), montando o jogo no GitHub a cada um.`);
  return iniciarMarco(env, p!.id);
}

function secaoDoGdd(gdd: string, marco: number) {
  const partes: string[] = []; for (let i = 0; i < gdd.length; i += SECAO) partes.push(gdd.slice(i, i + SECAO));
  const i = Math.min(marco - 1, partes.length - 1);
  return { texto: partes[i] ?? "", de: i + 1, total: partes.length };
}

export async function iniciarMarco(env: Env, projetoId: number): Promise<number> {
  const p = await env.DB.prepare("SELECT * FROM projetos WHERE id=?").bind(projetoId).first<any>();
  if (p.status !== "ativo") return 0; // pausado, testando ou concluído não abre marco novo
  const marco = p.marco + 1;
  if (marco > p.max_marcos) { await concluirProjeto(env, projetoId, "limite de marcos atingido"); return 0; }
  await env.DB.prepare("UPDATE projetos SET marco=? WHERE id=?").bind(marco, projetoId).run();
  const s = secaoDoGdd(p.gdd, marco);
  const texto = `MARCO ${marco} de até ${p.max_marcos} do projeto "${p.nome}".
Objetivo: deixar o jogo mais completo e JOGÁVEL no navegador, avançando o GDD.

## Memória do projeto (o que já existe)
${p.memoria || "(nada ainda: este é o primeiro marco — comece pelo núcleo jogável: personagem, controle, uma fase, objetivo)"}

## GDD — começo do documento (visão geral)
${p.gdd.slice(0, 2500)}

## GDD — seção em foco neste marco (${s.de}/${s.total})
${s.texto}`;
  const ped = await env.DB.prepare("INSERT INTO pedidos (texto, origem, projeto_id) VALUES (?, 'gdd', ?) RETURNING id").bind(texto, projetoId).first<{ id: number }>();
  // marco 1 (ou projeto sem bíblia): o Diretor de arte define o estilo antes de o gerente planejar
  let deps: number[] = [];
  if (!p.estilo) {
    const d = await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada) VALUES (?, 'diretor_arte', ?) RETURNING id")
      .bind(ped!.id, `Defina a bíblia de estilo do projeto "${p.nome}" a partir do GDD.

## GDD (começo)
${p.gdd.slice(0, 6000)}`).first<{ id: number }>();
    deps = [d!.id];
  }
  await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada, depende_de) VALUES (?, 'gerente', ?, ?)").bind(ped!.id, texto, JSON.stringify(deps)).run();
  await env.DB.prepare("INSERT INTO eventos (tipo, texto) VALUES ('marco', ?)").bind(`Projeto ${p.nome}: marco ${marco} começou (pedido #${ped!.id})`).run();
  return ped!.id;
}

export async function concluirProjeto(env: Env, projetoId: number, motivo: string) {
  const p = await env.DB.prepare("SELECT nome, slug, marco FROM projetos WHERE id=?").bind(projetoId).first<any>();
  await env.DB.prepare("UPDATE projetos SET status='concluido' WHERE id=?").bind(projetoId).run();
  await avisar(env, `🏆 Projeto "${p.nome}" encerrado depois de ${p.marco} marco(s) — ${motivo}.\nJogo: https://github.com/${cfg.repo}/tree/main/projetos/${p.slug}/jogo\n(baixe a pasta e abra o index.html)`);
}

// entrada do Integrador: arquivos atuais do jogo + nomes dos assets novos
export async function entradaIntegrador(env: Env, projetoId: number, assets: string[]): Promise<string> {
  // (assets = novos deste marco; somados aos que já estão no repositório)
  const p = await env.DB.prepare("SELECT nome, slug, marco, ultimo_teste FROM projetos WHERE id=?").bind(projetoId).first<any>();
  const atuais = await lerDoGitHub(env, `projetos/${p.slug}/jogo`, 20_000);
  assets = [...new Set([...assets, ...(await assetsDoProjeto(env, p.slug))])];
  return `Projeto "${p.nome}", marco ${p.marco}. Monte/atualize o jogo web com o que a equipe entregou acima.

## Assets disponíveis em assets/ (use estes nomes exatos)
${assets.length ? assets.map((a) => "- assets/" + a).join("\n") : "(nenhum asset novo neste marco)"}

${p.ultimo_teste ? `## Último teste do robô no navegador (corrija o que ele apontou de jogabilidade)\n${p.ultimo_teste}\n\n` : ""}## Arquivos atuais do jogo (preserve e evolua)
${atuais || "(nenhum: crie js/jogo.js do zero)"}

${await apiDoMotor(env)}`;
}

// fim do marco: grava o jogo e os assets no GitHub, atualiza a memória e já planeja o próximo marco
export async function fecharMarco(env: Env, pedidoId: number, projetoId: number, final: string,
  integracao: { nome: string; dados: Uint8Array }[], assets: { nome: string; dados: Uint8Array }[]) {
  const p = await env.DB.prepare("SELECT * FROM projetos WHERE id=?").bind(projetoId).first<any>();
  const base = `projetos/${p.slug}/jogo`;
  // motor fixo do estúdio: index.html e motor/motor.js sempre da versão oficial (o integrador só escreve js/ e dados)
  if (integracao.length) {
    const [motor, index] = await Promise.all([lerArquivo(env, "motor/motor.js", false), lerArquivo(env, "motor/index.html", false)]);
    integracao = integracao.filter((a) => a.nome !== "index.html" && !a.nome.startsWith("motor/"));
    if (motor) integracao.push({ nome: "motor/motor.js", dados: motor });
    // index.html carrega o motor e TODOS os js/*.js do jogo (o integrador pode dividir o código e mandar só o que mudou); js/jogo.js por último
    if (index) {
      const jsRepo = await jsDoProjeto(env, p.slug), jsNovos = integracao.filter((a) => /^js\/[\w.\-]+\.js$/.test(a.nome)).map((a) => a.nome);
      const todos = [...new Set([...jsRepo, ...jsNovos])].filter((n) => n !== "js/jogo.js").sort();
      const tags = [...todos, "js/jogo.js"].map((n) => `<script src="${n}"></script>`).join("\n");
      const html = new TextDecoder().decode(index).replace('<script src="js/jogo.js"></script>', tags);
      integracao.push({ nome: "index.html", dados: new TextEncoder().encode(html) });
    }
    // o motor sempre pede config.json e dialogos.json: garante versões vazias pra não dar 404 no teste
    const existentes = new Set([...(await assetsDoProjeto(env, p.slug)), ...assets.map((a) => a.nome)]);
    for (const [nome, vazio] of [["config.json", "{}"], ["dialogos.json", '{"dialogos":{},"textos":{}}'], ["estilo.json", "{}"]] as const)
      if (!existentes.has(nome)) assets.push({ nome, dados: new TextEncoder().encode(vazio) });
  }
  const link = integracao.length ? await salvarNoGitHub(env, base, integracao, `Marco ${p.marco}: jogo`) : null;
  if (assets.length) await salvarNoGitHub(env, `${base}/assets`, assets, `Marco ${p.marco}: assets`);
  const nova = `${p.memoria}\n\n## Marco ${p.marco} (pedido #${pedidoId})\nArquivos do jogo: ${integracao.map((a) => a.nome).join(", ") || "nenhum"}\nAssets: ${assets.map((a) => a.nome).join(", ") || "nenhum"}\n${final.slice(0, 3500)}`;
  await env.DB.prepare("UPDATE projetos SET memoria=? WHERE id=?").bind(nova.slice(-MEMORIA_MAX), projetoId).run();
  if (integracao.length && p.status !== "pausado") {
    // o jogo vai pro teste automático (GitHub Actions abre num navegador real); o próximo marco espera o resultado
    await env.DB.prepare("UPDATE projetos SET status='testando' WHERE id=?").bind(projetoId).run();
    await avisar(env, `🧪 Marco ${p.marco} do projeto "${p.nome}" montado — testando o jogo num navegador de verdade…${link ? `
${link}` : ""}`);
    return;
  }
  await avisar(env, `🎯 Marco ${p.marco} do projeto "${p.nome}" concluído${integracao.length ? "" : " (sem jogo montado neste marco)"}.`);
  if (p.status === "ativo") await iniciarMarco(env, projetoId);
}

// resultado do teste automático (chamado pelo GitHub Actions)
export async function resultadoTeste(env: Env, slug: string, ok: boolean, erros: string, relatorio = ""): Promise<string> {
  // o relatório do robô (jogabilidade) fica guardado pro QA e pro integrador do próximo marco, mesmo se o projeto não estiver esperando
  const teste = `${new Date().toISOString().slice(0, 16)} — ${ok ? "PASSOU" : "FALHOU"}${erros ? `\nErros:\n${erros}` : ""}${relatorio ? `\nJogabilidade:\n${relatorio}` : ""}`;
  await env.DB.prepare("UPDATE projetos SET ultimo_teste=? WHERE id=(SELECT id FROM projetos WHERE slug=? ORDER BY id DESC LIMIT 1)").bind(teste.slice(0, 4000), slug).run();
  const p = await env.DB.prepare("SELECT * FROM projetos WHERE slug=? AND status IN ('testando','corrigindo') ORDER BY id DESC LIMIT 1").bind(slug).first<any>();
  if (!p) return "nenhum projeto esperando teste (relatório guardado)";
  if (ok) {
    await env.DB.prepare("UPDATE projetos SET status='ativo', teste_tentativas=0 WHERE id=?").bind(p.id).run();
    await avisar(env, `✅ Marco ${p.marco} de "${p.nome}" passou no teste: o jogo abre, desenha e responde ao teclado.${relatorio ? `\n🕹️ ${relatorio.slice(0, 600)}` : ""}`);
    await iniciarMarco(env, p.id);
    return "aprovado";
  }
  if (p.teste_tentativas >= 3) {
    await env.DB.prepare("UPDATE projetos SET status='ativo', teste_tentativas=0 WHERE id=?").bind(p.id).run();
    await avisar(env, `⚠️ Marco ${p.marco} de "${p.nome}" ainda falha no teste depois de 3 correções. Seguindo pro próximo marco; erros:
${erros.slice(0, 1500)}`);
    await iniciarMarco(env, p.id);
    return "seguiu com falha";
  }
  // manda o Integrador corrigir exatamente os erros encontrados
  await env.DB.prepare("UPDATE projetos SET status='corrigindo', teste_tentativas=teste_tentativas+1 WHERE id=?").bind(p.id).run();
  const entrada = (await entradaIntegrador(env, p.id, await assetsDoProjeto(env, p.slug))) + `

## Erros do teste automático (corrija estes primeiro)
${erros.slice(0, 4000)}`;
  const ped = await env.DB.prepare("INSERT INTO pedidos (texto, origem, projeto_id, status) VALUES (?, 'gdd', ?, 'em_andamento') RETURNING id").bind(`Corrigir build do marco ${p.marco} de "${p.nome}" (tentativa ${p.teste_tentativas + 1})`, p.id).first<{ id: number }>();
  await env.DB.prepare("INSERT INTO tarefas (pedido_id, cargo, entrada) VALUES (?, 'integrador', ?)").bind(ped!.id, entrada).run();
  await avisar(env, `🔧 Marco ${p.marco} de "${p.nome}" falhou no teste. Integrador corrigindo (tentativa ${p.teste_tentativas + 1}/3):
${erros.slice(0, 600)}`);
  return "corrigindo";
}

async function jsDoProjeto(env: Env, slug: string): Promise<string[]> {
  if (!env.GITHUB_ASSETS_TOKEN) return [];
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/git/trees/HEAD?recursive=1`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, "user-agent": "estudio-worker" } });
  if (!r.ok) return [];
  const pre = `projetos/${slug}/jogo/`;
  return ((await r.json()) as any).tree.map((x: any) => x.path as string).filter((c: string) => c.startsWith(pre + "js/") && c.endsWith(".js")).map((c: string) => c.slice(pre.length));
}

async function assetsDoProjeto(env: Env, slug: string): Promise<string[]> {
  if (!env.GITHUB_ASSETS_TOKEN) return [];
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/git/trees/HEAD?recursive=1`, { headers: { authorization: `Bearer ${env.GITHUB_ASSETS_TOKEN}`, "user-agent": "estudio-worker" } });
  if (!r.ok) return [];
  const pre = `projetos/${slug}/jogo/assets/`;
  return ((await r.json()) as any).tree.map((x: any) => x.path as string).filter((c: string) => c.startsWith(pre)).map((c: string) => c.slice(pre.length));
}
