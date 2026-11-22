// Gera o "Kit de Mods" (ZIP) para a comunidade: dados originais do jogo, modelos e um criador de mods em HTML (offline).
// Uso: npx vite-node scripts/mod-kit.ts <pasta-de-saida>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLUBS_DATA } from '../src/data/clubs';
import { COMP_DEFAULTS, competitionIds } from '../src/data/names';
import { TROPHY_KEYS, MAX_TROPHY } from '../src/data/trophies';
import { modTemplate } from '../src/data/mods';
import { packTemplate } from '../src/data/playerpack';
import { APP_VERSION } from '../src/version';

const out = process.argv[2] ?? 'kit-de-mods';
mkdirSync(out, { recursive: true });

const clubs = Object.entries(CLUBS_DATA).flatMap(([division, list]) => list.map((c) => ({ id: c.id, division, name: c.name, shortName: c.shortName, primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, stadium: c.stadium, city: c.city })));
const csv = (rows: string[][]) => '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
writeFileSync(join(out, 'clubes-originais.csv'), csv([['id', 'divisao', 'nome', 'sigla', 'cor_principal', 'cor_secundaria', 'estadio', 'cidade'], ...clubs.map((c) => [c.id, c.division, c.name, c.shortName, c.primaryColor, c.secondaryColor, c.stadium, c.city])]));
const comps = [...Object.entries(COMP_DEFAULTS).map(([k, v]) => [k, v]), ...competitionIds().map((k) => [k, '(liga ou divisão)'])];
writeFileSync(join(out, 'competicoes-originais.csv'), csv([['chave', 'nome_original'], ...comps]));
writeFileSync(join(out, 'modelo-mod.json'), modTemplate());
writeFileSync(join(out, 'modelo-elencos.json'), packTemplate(2));

writeFileSync(join(out, 'LEIA-ME.txt'), `KIT DE MODS DA COMUNIDADE — Vida Real FC (v${APP_VERSION})

O que tem aqui
- criador-de-mods.html ... abra no navegador do celular ou do computador (funciona sem internet). Procure o clube, edite nome, sigla, cores, estádio, cidade e camisa, renomeie competições, escolha o troféu de cada competição (imagem) e toque em "Baixar mod".
- clubes-originais.csv ... todos os clubes ORIGINAIS do jogo com o "id" de cada um (o id é o que liga o seu mod ao clube).
- competicoes-originais.csv ... chaves das competições (copas, ligas e divisões), caso queira renomear.
- modelo-mod.json ... exemplo de mod de clubes (nomes, cores, estádio, cidade e uniforme).
- modelo-elencos.json ... exemplo de pacote de elencos (jogadores) e escudos. Para pacote com escudos e elencos, monte um ZIP com esse JSON e as imagens PNG/JPG dos escudos (nome do arquivo = o que está em "badge").

Como instalar o mod no jogo
Menu inicial > Mods da Comunidade > Importar e escolha o arquivo .json (ou o .zip do pacote de elencos). Ligue o mod e comece uma carreira NOVA: os mods valem para as próximas carreiras. Mods são um recurso do Premium.

Regras do arquivo
- Cores em #RRGGBB. Nome até 40 caracteres, estádio até 60.
- Só valem ids de clubes que existem no jogo (veja clubes-originais.csv).
- Até 5.000 clubes por pacote.
- Troféus: campo "trophies" do mod, com a chave da competição (cup, lib, sula, ucl, mundial, supermundial, nordeste, verde, sulsudeste, africa, arab) e a imagem em data URI (PNG, JPG ou WebP, até ~90 KB cada). O criador de mods em HTML faz isso sozinho.\n- Um mod só troca nomes, cores, estádios, cidades, uniformes, nomes de competições, troféus, elencos e escudos. Ele não altera o jogo em si.

Aviso
Os dados originais do jogo são fictícios. Nomes, escudos e imagens reais pertencem aos seus titulares. Quem cria, publica ou instala um mod é responsável pelo que usa: o Vida Real FC não se responsabiliza por nenhum mod da comunidade. Instale só mods de fontes em que você confia.
`);

// criador de mods (HTML único, offline)
const data = JSON.stringify(clubs).replace(/</g, '\\u003c');
const trophData = JSON.stringify(TROPHY_KEYS.map((k) => ({ key: k, name: (COMP_DEFAULTS as Record<string, string>)[k] ?? k }))).replace(/</g, '\\u003c');
const compData = JSON.stringify(comps.map(([k, v]) => ({ key: k, original: v }))).replace(/</g, '\\u003c');
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Criador de Mods — Vida Real FC</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#070706;color:#f3f1ea;font:15px/1.4 system-ui,sans-serif}
header{padding:14px 16px;background:#14130f;border-bottom:2px solid #f5c542;position:sticky;top:0;z-index:5}
h1{margin:0 0 8px;font-size:18px;color:#f5c542}.row{display:flex;gap:8px;flex-wrap:wrap}
input,select,button{font:inherit;color:inherit;background:#1d1b15;border:1px solid #3a3626;border-radius:8px;padding:8px}
input[type=color]{padding:2px;width:44px;height:38px}button{background:#f5c542;color:#111;font-weight:700;border:0;cursor:pointer}button.sec{background:#2a271d;color:#f3f1ea;border:1px solid #3a3626}
main{padding:12px 16px 80px;max-width:900px;margin:0 auto}.card{background:#14130f;border:1px solid #2c2a20;border-radius:12px;padding:12px;margin:10px 0}
.card h3{margin:0 0 6px;font-size:15px}.card small{color:#b8b4a5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px}
label{display:block;font-size:12px;color:#b8b4a5}label input,label select{width:100%;margin-top:2px}.chg{border-color:#f5c542}
.note{font-size:12px;color:#b8b4a5}.bar{position:fixed;left:0;right:0;bottom:0;background:#14130f;border-top:2px solid #f5c542;padding:10px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between}
</style></head><body>
<header><h1>🛠️ Criador de Mods — Vida Real FC</h1>
<div class="row"><input id="q" placeholder="Buscar clube (nome, sigla, cidade ou id)" style="flex:1;min-width:200px"><select id="div"><option value="">Todas as divisões</option></select></div></header>
<main>
<div class="card"><h3>Dados do pacote</h3><div class="grid"><label>Nome do mod<input id="mn" value="Meu pacote" maxlength="40"></label><label>Autor<input id="ma" value="Seu nome" maxlength="40"></label><label>Versão<input id="mv" value="1.0" maxlength="10"></label></div>
<p class="note">Só os campos que você mudar vão para o arquivo. Depois: Menu inicial > Mods da Comunidade > Importar. Os dados originais do jogo são fictícios; nomes e escudos reais pertencem aos seus titulares e o uso é por sua conta e risco.</p></div>
<div class="card"><h3>Nomes das competições (opcional)</h3><div id="comps" class="grid"></div></div>
<div class="card"><h3>Troféus das competições (opcional)</h3><p class="note">Escolha a imagem do troféu de cada competição (PNG, JPG ou WebP). Ela aparece nas listas de campeões do jogo. A imagem é reduzida automaticamente.</p><div id="trophs" class="grid"></div></div>
<p class="note" id="count"></p><div id="list"></div><div class="row" style="justify-content:center"><button class="sec" id="more">Mostrar mais</button></div>
</main>
<div class="bar"><span id="chg" class="note">Nenhuma alteração</span><div class="row"><label class="sec" style="margin:0"><button class="sec" onclick="document.getElementById('imp').click()">Abrir mod existente</button><input id="imp" type="file" accept=".json" hidden></label><button id="dl">⬇️ Baixar mod</button></div></div>
<script>
const CLUBS=${data};const COMPS=${compData};const TROPH=${trophData};const MAXT=${MAX_TROPHY};
const PATTERNS=[['','Lisa (padrão)'],['solid','Lisa'],['stripes','Listras'],['hoops','Faixas'],['half','Metade'],['sash','Faixa diagonal'],['checks','Xadrez']];
const ch={};const kit={};const compCh={};const trophCh={};let shown=40;
const $=id=>document.getElementById(id);
[...new Set(CLUBS.map(c=>c.division))].forEach(d=>{const o=document.createElement('option');o.value=d;o.textContent=d;$('div').appendChild(o)});
COMPS.forEach(c=>{const l=document.createElement('label');l.innerHTML='<span></span><input maxlength="40">';l.firstChild.textContent=c.key+' ('+c.original+')';l.lastChild.oninput=e=>{const v=e.target.value.trim();if(v)compCh[c.key]=v;else delete compCh[c.key];status()};$('comps').appendChild(l)});
function shrink(file,cb){const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{for(const s of [128,96,64]){const k=Math.min(1,s/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));c.getContext('2d').drawImage(im,0,0,c.width,c.height);const u=c.toDataURL('image/png');if(u.length<=MAXT){cb(u);return}}alert('Imagem complexa demais: use uma menor.')};im.onerror=()=>alert('Não foi possível ler a imagem.');im.src=r.result};r.readAsDataURL(file)}
TROPH.forEach(t=>{const l=document.createElement('label');l.innerHTML='<span></span><input type="file" accept="image/png,image/jpeg,image/webp"><img alt="" style="display:none;height:40px;margin-top:4px">';l.firstChild.textContent=t.key+' ('+t.name+')';const inp=l.children[1],img=l.children[2];inp.onchange=()=>{const f=inp.files[0];if(!f)return;shrink(f,u=>{trophCh[t.key]=u;img.src=u;img.style.display='block';status()})};$('trophs').appendChild(l)});
const FIELDS=[['name','Nome',40],['shortName','Sigla',6],['stadium','Estádio',60],['city','Cidade',40]];
function status(){const n=Object.keys(ch).length+Object.keys(kit).length+Object.keys(compCh).length+Object.keys(trophCh).length;$('chg').textContent=n?('Alterações: '+Object.keys({...ch,...kit}).length+' clube(s)'+(Object.keys(compCh).length?' e '+Object.keys(compCh).length+' competição(ões)':'')+(Object.keys(trophCh).length?' · '+Object.keys(trophCh).length+' troféu(s)':'')):'Nenhuma alteração'}
function render(){const q=$('q').value.trim().toLowerCase(),d=$('div').value;const list=CLUBS.filter(c=>(!d||c.division===d)&&(!q||(c.name+' '+c.shortName+' '+c.city+' '+c.id).toLowerCase().includes(q)));
$('count').textContent=list.length+' clube(s) encontrados';const box=$('list');box.innerHTML='';
list.slice(0,shown).forEach(c=>{const p=ch[c.id]||{},k=kit[c.id]||{};const el=document.createElement('div');el.className='card'+((ch[c.id]||kit[c.id])?' chg':'');
el.innerHTML='<h3></h3><small></small><div class="grid"></div>';el.querySelector('h3').textContent=c.name;el.querySelector('small').textContent='id: '+c.id+' · '+c.division;const g=el.querySelector('.grid');
FIELDS.forEach(([f,l,m])=>{const lb=document.createElement('label');lb.innerHTML='<span></span><input maxlength="'+m+'">';lb.firstChild.textContent=l;const i=lb.lastChild;i.value=p[f]??c[f];i.oninput=()=>{const v=i.value.trim();(ch[c.id]??={});if(v&&v!==c[f])ch[c.id][f]=v;else delete ch[c.id][f];if(!Object.keys(ch[c.id]).length)delete ch[c.id];el.classList.toggle('chg',!!(ch[c.id]||kit[c.id]));status()};g.appendChild(lb)});
[['primaryColor','Cor principal'],['secondaryColor','Cor secundária']].forEach(([f,l])=>{const lb=document.createElement('label');lb.innerHTML='<span></span><input type="color">';lb.firstChild.textContent=l;const i=lb.lastChild;i.value=p[f]??c[f];i.oninput=()=>{(ch[c.id]??={});if(i.value.toLowerCase()!==c[f].toLowerCase())ch[c.id][f]=i.value;else delete ch[c.id][f];if(!Object.keys(ch[c.id]).length)delete ch[c.id];el.classList.toggle('chg',!!(ch[c.id]||kit[c.id]));status()};g.appendChild(lb)});
const kp=document.createElement('label');kp.innerHTML='<span>Camisa: padrão</span><select></select>';PATTERNS.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;kp.lastChild.appendChild(o)});kp.lastChild.value=k.pattern||'';g.appendChild(kp);
const kc=[['base','Camisa: cor base'],['accent','Camisa: detalhe']].map(([f,l])=>{const lb=document.createElement('label');lb.innerHTML='<span></span><input type="color">';lb.firstChild.textContent=l;lb.lastChild.value=k[f]||(f==='base'?(p.primaryColor||c.primaryColor):(p.secondaryColor||c.secondaryColor));g.appendChild(lb);return lb.lastChild});
const upd=()=>{const pat=kp.lastChild.value;if(!pat){delete kit[c.id]}else kit[c.id]={pattern:pat,base:kc[0].value,accent:kc[1].value,sleeves:kc[0].value,collar:kc[1].value,number:'#ffffff'};el.classList.toggle('chg',!!(ch[c.id]||kit[c.id]));status()};kp.lastChild.onchange=upd;kc.forEach(i=>i.oninput=()=>{if(kp.lastChild.value)upd()});
box.appendChild(el)});$('more').style.display=list.length>shown?'':'none'}
$('q').oninput=()=>{shown=40;render()};$('div').onchange=()=>{shown=40;render()};$('more').onclick=()=>{shown+=60;render()};
$('dl').onclick=()=>{const ids=[...new Set([...Object.keys(ch),...Object.keys(kit)])];if(!ids.length&&!Object.keys(compCh).length&&!Object.keys(trophCh).length){alert('Faça pelo menos uma alteração antes de baixar.');return}
const mod={name:$('mn').value.trim()||'Meu pacote',author:$('ma').value.trim(),version:$('mv').value.trim()||'1.0',clubs:ids.map(id=>({id,...(ch[id]||{}),...(kit[id]?{kit:kit[id]}:{})}))};if(Object.keys(compCh).length)mod.competitions=compCh;if(Object.keys(trophCh).length)mod.trophies=trophCh;
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(mod,null,2)],{type:'application/json'}));a.download=(mod.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'mod')+'.json';a.click()};
$('imp').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{const m=JSON.parse(t);(m.clubs||[]).forEach(c=>{const {id,kit:kk,...rest}=c;if(Object.keys(rest).length)ch[id]=rest;if(kk)kit[id]=kk});Object.assign(compCh,m.competitions||{});Object.assign(trophCh,m.trophies||{});$('mn').value=m.name||'';$('ma').value=m.author||'';$('mv').value=m.version||'1.0';render();status()}catch{alert('Arquivo inválido.')}})};
render();
</script></body></html>`;
writeFileSync(join(out, 'criador-de-mods.html'), html);
console.log(`Kit gerado em ${out}: ${clubs.length} clubes, ${comps.length} competições`);
