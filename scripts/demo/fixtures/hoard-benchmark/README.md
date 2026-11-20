# Hoard benchmark fixture

`configuracoes-atual.spec.json`: Hoard's whole Settings screen (Hoard 2.7.1, read from its code, 2026-11-20) as one
phone screen, status **current**, in the paired-server state, built with `designer wf build` only (library
components). Made by `node make-current.ts` (edit that, not the JSON). Input of the agent benchmark: video 15 and
`docs/agents.md` → Benchmark.

Checked against the source list, section by section (89 items for `scripts/benchmark-coverage.ts`):

1. Servidor de fotos: help text; server row (Versão · URL, lock, "Endereço"); Situação (synced, 12.480 itens) +
   "Sincronizar agora"; Este celular; Backup do celular (→, folders, done/total, freed); Cache de prévias +
   "Limpar cache" + Limite do cache (256 MB / 1,1 GB / 4,3 GB, 1,1 GB); Miniaturas offline + "Limpar cache" + the two
   checkboxes (on / off); Originais guardados + "Limpar cache" + 512 MiB / 2 GiB / 8 GiB (2 GiB); Pastas mapeadas
   (with-some text) + one mapping with "Esquecer"; Desparear (→); Pastas do celular + one added folder (X) +
   "Adicionar uma pasta".
2–4. Tema, Paleta, Idioma: radio groups, defaults Sistema, Azul, Idioma do sistema.
5. Navegação: Mostrar arquivos ocultos (toggle, off, help), Ordem padrão (Nome), Direção da ordem (De A a Z), help.
6. Transferências: Se o arquivo já existir (Perguntar) + its help; Tempo limite (1,5 s) + help.
7. Armazenamento do telefone: Acesso a todos os arquivos, permitted, "Alterar".
8. Fotos copiadas para o Reveal: "3 fotos, 84 MB" + help + "Apagar cópias".
9. Links do Reveal: "O Reveal pode reabrir 5 arquivos…" + help + "Revogar todos".
10. Lixeira: Abrir a lixeira (→); Esvaziar automaticamente (30 dias) + help; Gerenciamento de mídia, permitted, "Alterar".
11. Seleção de fotos: help; Fotos desfocadas / Olhos fechados (Média) and Intervalo da sequência (1 s) as segmented
    chips with their hints; Gravar o XMP como arquivo oculto (toggle, off, hint).
12. Sobre: Versão 2.7.1; Dados do Hoard 1; the license text; Código-fonte; Licença (AGPL-3.0); Licenças de código
    aberto (→).

Not drawn, listed in the note on the top bar: the unpaired state ("Parear com um servidor de fotos"), the http://
warning, the Situação lines of pending/error states, "Comprimir vídeos" (server feature), empty states of backup /
mapped folders / Reveal copies and links, "Pastas onde o Hoard pode salvar", the Lixeira permission states, and the
texts that change with an option.
