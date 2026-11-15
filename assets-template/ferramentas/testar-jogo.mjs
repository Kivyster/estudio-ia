// Robô de teste: abre cada jogo alterado num Chromium real e
//  1) confere o básico: sem erro, sem arquivo faltando, desenha algo, responde ao teclado;
//  2) JOGA: sai do título, pula diálogos, verifica se o jogador anda/pula/pousa e tenta atravessar a fase
//     (segura pra frente, pula em parede e buraco) por até 40 s, medindo quanto avançou, mortes e se chegou ao fim.
// Envia o resultado pro escritório (POST /api/teste-jogo): erros reprovam; o relatório de jogabilidade vai pro QA e pro integrador.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const slugs = process.argv.slice(2);
const API = `${process.env.ESTUDIO_URL}/api/teste-jogo`;
const browser = await chromium.launch();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

for (const slug of slugs) {
  const dir = `projetos/${slug}/jogo`;
  if (!existsSync(`${dir}/index.html`)) continue;
  const srv = spawn('python3', ['-m', 'http.server', '8099', '--directory', dir], { stdio: 'ignore' });
  await espera(1500);
  const erros = [], relatorio = [];
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  page.on('pageerror', (e) => erros.push(`erro de JavaScript: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => erros.push(`arquivo não carregou: ${r.url().replace('http://localhost:8099/', '')}`));
  page.on('response', (r) => { if (r.status() >= 400) erros.push(`arquivo não encontrado (${r.status()}): ${r.url().replace('http://localhost:8099/', '')}`); });
  const tecla = async (k, ms = 120) => { await page.keyboard.down(k); await espera(ms); await page.keyboard.up(k); };
  const diag = () => page.evaluate(() => {
    const M = window.Motor; if (!M || !M._diag) return null;
    const j = M._diag.jogador, m = M._diag.mapa;
    return { cena: M.cenaAtual(), entradas: { ...M._diag.entradas }, dialogo: M.emDialogo && M.emDialogo(), modo: M._diag.modo,
      j: j ? { x: j.x, y: j.y, w: j.w, h: j.h, noChao: !!j.noChao, bateuX: j.bateu ? j.bateu.x : 0, vida: j.vida } : null,
      mapa: m && m.pronto ? { largura: m.largura, altura: m.altura, saida: (m.achar('saida')[0] || m.achar('saída')[0] || null) } : null,
      tipoFrente: j && m && m.pronto ? m.tipoEm(j.x + j.w + 6, j.y + j.h + 4) : null };
  });
  try {
    await page.goto('http://localhost:8099/index.html', { waitUntil: 'load', timeout: 15000 });
    await espera(2000);
    const assinatura = async () => page.evaluate(() => {
      const c = document.querySelector('canvas'); if (!c) return { canvas: false };
      const x = c.getContext('2d'); if (!x) return { canvas: true, cores: 0, soma: 0 };
      const d = x.getImageData(0, 0, c.width, c.height).data; const cores = new Set(); let soma = 0;
      for (let i = 0; i < d.length; i += 4 * 97) { cores.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); soma += d[i] + d[i + 1] * 3 + d[i + 2] * 7 + i; }
      return { canvas: true, cores: cores.size, soma };
    });
    const a1 = await assinatura();
    if (!a1.canvas) erros.push('a página não tem <canvas>');
    else if (a1.cores < 2) erros.push('a tela está vazia (uma cor só): o jogo não desenhou nada');

    // ---- entrar no jogo: Espaço/Enter no título até a cena mudar, pulando diálogos ----
    const d0 = await diag();
    if (!d0) relatorio.push('o jogo não usa o Motor do estúdio (sem diagnóstico de jogabilidade)');
    const cenaTitulo = d0 && d0.cena;
    for (let i = 0; i < 8; i++) { const d = await diag(); if (d && d.cena !== cenaTitulo && !d.dialogo) break; await tecla(i % 2 ? 'Enter' : 'Space'); await espera(350); }
    for (let i = 0; i < 25; i++) { const d = await diag(); if (!d || !d.dialogo) break; await tecla('Space'); await espera(200); }
    await espera(800);
    const a2 = await assinatura();
    if (a1.canvas && a2.soma === a1.soma) erros.push('a tela não mudou depois de apertar Espaço/Enter (jogo parado, travado ou sem cena de jogo)');

    // ---- jogabilidade ----
    let d = await diag();
    if (d && d0) {
      if (d.cena === cenaTitulo) erros.push(`não consegui sair da cena "${cenaTitulo}" com Espaço/Enter (menu do título não responde)`);
      if (!d.j) relatorio.push('nenhum jogador encontrado: o jogo não chama Motor.plataforma nem Motor.vistaDeCima (movimento próprio?)');
      else {
        const x0 = d.j.x, y0 = d.j.y;
        await page.keyboard.down('ArrowRight'); await espera(700); await page.keyboard.up('ArrowRight'); await espera(150);
        d = await diag();
        if (Math.abs(d.j.x - x0) < 4 && Math.abs(d.j.y - y0) < 4) erros.push('o jogador não se mexe com a seta → (controle quebrado)');
        if (d.modo === 'plataforma') {
          await espera(800); d = await diag();
          if (!d.j.noChao) erros.push('o jogador não fica no chão depois de 1 s (cai pelo mapa ou flutua)');
          const yAntes = d.j.y; await tecla('Space', 200); await espera(120); const dp = await diag();
          if (dp.j.y > yAntes - 4) erros.push('o pulo não funciona (Espaço não tira o jogador do chão)');
        }
        // tenta atravessar a fase: segura pra frente; pula ao bater em parede, antes de buraco/perigo, ou parado
        const largura = d.mapa ? d.mapa.largura : null, cena0 = d.cena, mortes0 = d.entradas[cena0] || 1;
        let maxX = d.j.x, parado = 0, ultX = d.j.x, chegou = false, t0 = Date.now();
        await page.keyboard.down('ArrowRight');
        while (Date.now() - t0 < 40000) {
          await espera(120); d = await diag(); if (!d || !d.j) break;
          if (d.cena !== cena0) { chegou = !/titulo|menu|derrota|game.?over|fim_ruim/i.test(d.cena); break; }
          if (d.dialogo) { await tecla('Space'); continue; }
          maxX = Math.max(maxX, d.j.x);
          const travado = Math.abs(d.j.x - ultX) < 1; parado = travado ? parado + 1 : 0; ultX = d.j.x;
          if (d.modo === 'plataforma' && (d.j.bateuX || parado > 2 || d.tipoFrente === 'vazio' || d.tipoFrente === 'perigo' || d.tipoFrente === 'agua')) await tecla('Space', parado > 6 ? 320 : 220);
          if (d.modo === 'cima' && parado > 2) { await tecla(Math.random() < 0.5 ? 'ArrowUp' : 'ArrowDown', 400); }
          if (d.mapa && d.mapa.saida && Math.abs(d.j.x - d.mapa.saida.x) < 12 && Math.abs(d.j.y - d.mapa.saida.y) < 20) { await espera(600); d = await diag(); chegou = chegou || d.cena !== cena0; break; }
        }
        await page.keyboard.up('ArrowRight');
        d = await diag();
        const mortes = Math.max(0, ((d && d.entradas[cena0]) || mortes0) - mortes0);
        const pct = largura ? Math.round((maxX / largura) * 100) : null;
        relatorio.push(`jogada automática (40 s, só segurando → e pulando): avançou ${pct ?? '?'}% da largura da fase, ${mortes} morte(s)/reinício(s), ${chegou ? 'chegou ao fim (a cena mudou)' : 'não chegou ao fim'}.`);
        if (pct !== null && pct < 15) relatorio.push('pouco avanço: pode haver parede/salto impossível logo no começo, controle ruim ou fase vazia.');
        if (mortes >= 4) relatorio.push('muitas mortes seguidas: perigo/inimigo mal posicionado ou dano injusto logo no começo.');
        if (d && d.j && d.j.vida != null) relatorio.push(`vida do jogador no fim: ${d.j.vida}`);
      }
    }
  } catch (e) { erros.push(`a página não abriu ou travou: ${e.message}`); }
  srv.kill();
  const ok = erros.length === 0;
  console.log(slug, ok ? 'OK' : 'FALHOU', erros, relatorio);
  const r = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${process.env.ESTUDIO_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ slug, ok, erros: [...new Set(erros)].slice(0, 20).join('\n'), relatorio: relatorio.join('\n') }) });
  console.log('escritório:', r.status, await r.text());
}
await browser.close();
