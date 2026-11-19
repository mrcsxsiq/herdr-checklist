# herdr-tasks-mod

Um checklist de atividades para o app desktop do [Herdr](https://herdr.dev). Um botão **Checklist** na barra de abas, ao lado de Issues, Jira e GitLab, abre um painel lateral onde você anota o que precisa fazer e vai marcando.

![Checklist](preview.png)

- **Por espaço ou geral.** "This space" mostra só as atividades do espaço (pasta e máquina) em foco; "All" mostra as de todos os espaços, cada uma com o nome do espaço embaixo. Uma atividade nova entra sempre no espaço em foco.
- **Marcar é um clique**, na caixa ou no texto. As abertas ficam em cima (a mais antiga primeiro) e as feitas embaixo, riscadas.
- **Filtros** All, Open e Done, cada um com a contagem, e **Clear done** (pede um segundo clique para confirmar).
- **O botão mostra quantas atividades abertas** o espaço em foco tem.
- **Os dados ficam num arquivo** que você pode ler, editar e copiar. Todas as cópias do mod (painel e botão) acompanham mudanças nele sozinhas.

O nome do repositório é `herdr-tasks-mod`; o mod se chama `checklist` (o `tasks` já foi um mod de outro projeto, e as chaves `tasks.*` dele ainda existem no `shared.json`).

## Instalar

Precisa do app desktop do Herdr (testado na 0.1.11). Sem dependências.

```sh
git clone git@github.com:mrcsxsiq/herdr-tasks-mod.git ~/GitHub/mrcsxsiq/herdr-tasks-mod
ln -s ~/GitHub/mrcsxsiq/herdr-tasks-mod/mods/checklist ~/.config/herdr-app/mods/checklist
herdr-app check ~/.config/herdr-app/mods/checklist
```

O link simbólico faz um `git pull` atualizar o mod, e salvar um arquivo recarrega o mod na hora. O mod não usa imagens, então o link funciona (o Herdr não carrega imagens de pasta com link).

Depois ponha os dois blocos no seu layout (`~/.config/herdr-app/layouts/<o seu>.json`). O painel entra na pilha lateral, junto com Files e Changes:

```json
{ "id": "checklist", "type": "block", "content": { "mod": "checklist" } }
```

E o botão, na linha da barra de abas (`tab-bar`), depois das abas:

```json
{ "id": "checklist-button", "type": "block", "size": { "px": 132 }, "window_drag": true,
  "content": { "mod": "checklist", "props": { "view": "button" } } }
```

Se a barra de abas do seu layout ainda for um bloco só (`"id": "tabs"`), troque-o por uma linha com as abas e os botões, como no layout `main` do Herdr com botões extras:

```json
{ "id": "tab-bar", "type": "row", "size": { "px": 42 }, "resizable": false, "children": [
  { "id": "tabs", "type": "block", "window_drag": true, "content": { "mod": "tabs" } },
  { "id": "checklist-button", "type": "block", "size": { "px": 132 }, "window_drag": true,
    "content": { "mod": "checklist", "props": { "view": "button" } } } ] }
```

O botão também registra `checklist` em `workspace.panels`, a lista que a barra de abas usa para reabrir o painel de cada espaço. Isso acontece sozinho, na primeira vez que ele aparece.

## Os dados

`~/.config/herdr-app/data/checklist/items.json`:

```json
{
  "version": 1,
  "items": [
    {
      "id": "m3k9q1ab",
      "text": "Revisar os pull requests abertos",
      "done": false,
      "space": { "key": "|/caminho/do/projeto", "name": "api" },
      "createdAt": 1763500000000,
      "doneAt": null
    }
  ]
}
```

- `space.key` é `máquina|pasta` (máquina vazia é este computador), então renomear um espaço não separa as atividades dele.
- **O mod nunca sobrescreve um arquivo que não conseguiu ler.** Se o JSON estiver quebrado, o painel mostra o erro e não grava nada até você consertar. Itens malformados (sem `id`, `text` ou `space.key`) são descartados na próxima gravação.
- Cada mudança lê o arquivo na hora, aplica a alteração e grava só se o arquivo não mudou no meio (`writeTextFile` com `expected`); se mudou, refaz sobre o conteúdo novo. Por isso duas cópias, ou você editando à mão, não se atropelam.
- Para fazer backup ou levar para outro computador, copie o arquivo.

## O que o mod acessa

Nada de rede. Lê e grava só `~/.config/herdr-app/data/checklist/`, e roda um único programa, `mkdir -p`, para criar essa pasta.

## Desenvolvimento

```sh
npm test          # node --test: as regras de dados e a gravação, sem o Herdr
herdr-app check mods/checklist
```

- `mods/checklist/store.js` tem os dados e as regras (`add`, `toggle`, `remove`, `clearDone`, `counts`, `view`) e a gravação com nova tentativa (`mutate`). Não importa nada do Herdr, e é o que `test/store.test.js` cobre.
- `mods/checklist/main.js` é a interface: o painel e a view do botão (`props.view === "button"`).
- Todo texto que aparece na tela está no objeto `TEXT`, no topo do `main.js`.
- `RECIPE.md` descreve o mod inteiro, para refazer ou mudar com um agente.

## O que não foi testado

As regras de dados e a gravação têm testes automáticos. A interface foi conferida no Herdr 0.1.11 com dados de exemplo (lista, riscado, filtros, contagem, botão com contador, e o painel acompanhando uma mudança feita no arquivo por fora). **Digitar uma atividade, marcar, apagar e "Clear done" pelo clique não foram exercitados pela interface**, porque o Herdr não tem comando de clique ou digitação.

## Ideias que ficaram de fora

Editar o texto de uma atividade, reordenar, prazo, e um atalho de teclado para abrir o painel.
