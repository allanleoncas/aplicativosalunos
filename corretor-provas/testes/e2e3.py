import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':400,'height':860}, device_scale_factor=2, accept_downloads=True)
        pg = await ctx.new_page(); erros=[]
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('console', lambda m: erros.append('console:'+m.text) if m.type=='error' else None)
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='t1_lista.png')
        await pg.click('text=+ Nova avaliação'); await pg.wait_for_timeout(200)
        async def campo(rot, val):
            el = pg.locator('label.campo', has_text=rot).locator('input')
            await el.fill(val); await el.dispatch_event('change'); await pg.wait_for_timeout(120)
        await campo('Curso','Direito'); await campo('Disciplina','Introdução à Economia'); await campo('Título','Prova Bimestral'); await campo('Chamada','Primeira chamada'); await campo('Valor da prova','8')
        d = pg.locator('input[type=date]'); await d.fill('2026-11-27'); await d.dispatch_event('change'); await pg.wait_for_timeout(150)
        await pg.set_input_files('#arqCab','cab_teste.pdf'); await pg.wait_for_selector('img.cab', timeout=20000)
        await pg.set_input_files('#arqBanco','banco_direito_economia_unid06a08.xlsx'); await pg.wait_for_selector('ul.temas', timeout=20000)
        await pg.fill('#txtAlunos', open('alunos_teste.txt').read()); await pg.click('text=Usar lista colada'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='t2_editor.png', full_page=True)
        async with pg.expect_download(timeout=60000) as dl:
            await pg.click('text=Gerar provas (PDF)')
        await (await dl.value).save_as('provas.pdf')
        async with pg.expect_download(timeout=60000) as dl:
            await pg.click('text=Baixar gabarito do professor (PDF)')
        await (await dl.value).save_as('gabarito.pdf')
        await pg.wait_for_timeout(400)
        dbjs = await pg.evaluate("JSON.stringify(av().gerado.alunos.map(a=>({codigo:a.codigo,gabarito:a.gabarito,q:a.questoes.map(x=>x.qid)})))")
        open('gerado.json','w').write(dbjs)
        print('ERROS:', erros)
        await ctx.storage_state(path='estado.json')
        # salva IndexedDB: manter a página aberta para próxima fase
        import subprocess; subprocess.run(['python3','sim2.py'],check=True)
        sys.argv=['x']+open('fotos.txt').read().split()
        if len(sys.argv)>1:
            await pg.click('nav.tabs >> text=Corrigir'); await pg.wait_for_timeout(300)
            for f in sys.argv[1:]:
                await pg.set_input_files('#arqFoto', f)
                await pg.wait_for_selector('#res.on', timeout=20000); await pg.wait_for_timeout(200)
                t = await pg.inner_text('#resConteudo .card >> nth=0'); print(f, '=>', t.replace('\n',' | ')[:140])
                await pg.click('#resConteudo button:text-is("Salvar")'); await pg.wait_for_timeout(300)
            await pg.click('nav.tabs >> text=Turma'); await pg.wait_for_timeout(300)
            await pg.screenshot(path='t4_turma.png')
            async with pg.expect_download(timeout=60000) as dl:
                await pg.click('text=Relatório (PDF)')
            await (await dl.value).save_as('relatorio.pdf')
            print('ERROS2:', erros)
        await b.close()
asyncio.run(main())
