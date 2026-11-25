import asyncio, json, time
from playwright.async_api import async_playwright
esp=json.load(open('esperado.json')); ger={a['codigo']:a for a in json.load(open('gerado.json'))['alunos']}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':400,'height':860}, device_scale_factor=2, accept_downloads=True)
        pg = await ctx.new_page(); erros=[]
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: erros.append('console:'+m.text) if m.type=='error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('http://localhost:8765/index.html?local=1'); await pg.wait_for_timeout(800)
        await pg.evaluate("d => { db = JSON.parse(d); salvarDB(); render(); }", open('db.json').read())
        await pg.click('nav.tabs >> text=Corrigir'); await pg.wait_for_timeout(300)
        await pg.click('#v-corrigir .avcard'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='c1_corrigir.png')
        t=time.time()
        await pg.set_input_files('#arqPDF', ['escaneado_1.pdf','escaneado_2.pdf'])
        await pg.wait_for_selector('#res.on', timeout=120000); print('tempo leitura', round(time.time()-t,1),'s')
        await pg.wait_for_timeout(300); await pg.screenshot(path='c2_lote.png', full_page=True)
        itens = json.loads(await pg.evaluate("JSON.stringify({itens: lote.itens.map(x=>({c:x.aluno.codigo,r:x.rotulo,m:x.marcadas,s:x.status})), sem: lote.semFolha, nao: lote.naoLidas})"))
        print('sem folha', len(itens['sem']), 'nao lidas', itens['nao'])
        ok=0
        for it in itens['itens']:
            e=esp[it['c']]; certo = it['m']==e['marc'] and it['s']==e['st']
            ok+=certo; print(it['c'], it['r'], ''.join(x or '-' for x in it['m']), it['s'] if not certo else '', 'OK' if certo else 'ERRO esperado '+''.join(x or '-' for x in e['marc'])+' '+str(e['st']))
        print('corretas', ok, '/', len(esp))
        # conferir P03 (branco) e escolher a letra
        await pg.click('#resConteudo li:has-text("ALUNO TESTE 03")'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='c3_item.png', full_page=True)
        await pg.click('.ch.warn'); await pg.wait_for_timeout(150)
        g3=ger['P03']['gabarito'][3]
        await pg.click('#pkOpts button:text-is("%s")' % g3); await pg.wait_for_timeout(200)
        await pg.click('text=Salvar e voltar à lista'); await pg.wait_for_timeout(300)
        await pg.click('text=Salvar as 8 correções'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='c4_salvo.png', full_page=True)
        await pg.click('#resConteudo >> text=Fechar'); await pg.wait_for_timeout(300)
        res = json.loads(await pg.evaluate("JSON.stringify(av().resultados)"))
        okn=0
        for c,r in res.items():
            e=esp[c]['acertos'] + (1 if c=='P03' else 0)
            okn += (r['acertos']==e and r['nota']==e); 
        print('notas exatas', okn, '/', len(res), {c:r['nota'] for c,r in res.items()})
        await pg.click('nav.tabs >> text=Turma'); await pg.wait_for_timeout(300); await pg.screenshot(path='c5_turma.png', full_page=True)
        # recarregar mantém
        await pg.reload(); await pg.wait_for_timeout(800)
        print('apos recarregar', await pg.evaluate("Object.keys(av().resultados).length"))
        print('ERROS:', erros)
        await b.close()
asyncio.run(main())
