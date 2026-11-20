// Writes configuracoes-atual.spec.json: Hoard's whole Settings screen (Hoard 2.7.1, read from its code:
// ~/designer-demos/inputs/hoard/configuracoes-completa.md) in the paired-server state, as ONE tall phone screen with
// status "current" — the input of Henrique's agent benchmark (docs/agents.md → Benchmark). Items that only appear in
// other states are listed in a note on the top bar. Run: node scripts/demo/fixtures/hoard-benchmark/make-current.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type N = Record<string, unknown>;
const help = (text: string): N => ({ text: { text, size: 'small', tone: 'muted' } });
const label = (text: string): N => ({ text: { text, size: 'body' } });
const section = (l: string): N => ({ 'section-header': { label: l } });
const row = (title: string, o: { sub?: string; icon?: string; trailing?: 'none' | 'chevron' | 'value' | 'toggle'; value?: string } = {}): N => ({
  'list-row': {
    title,
    ...(o.sub ? { subtitle: o.sub } : {}),
    ...(o.icon ? { leading: 'icon', leadingIcon: `lucide:${o.icon}` } : {}),
    trailing: o.trailing ?? 'none',
    ...(o.trailing === 'value' ? { value: o.value } : {}),
  },
});
const radio = (l: string, options: string[], selected: number): N => ({ 'radio-group': { label: l, options, selected } });
const chips = (labels: string[], selected: number): N => ({ 'segmented-control': { labels, selected } });
const button = (l: string, variant = 'text'): N => ({ button: { label: l, variant } });

const other = [
  'Itens que só aparecem em outros estados (não desenhados):',
  '• Sem servidor pareado: a linha "Parear com um servidor de fotos" (sub "Leia o QR code da página de configuração do servidor, ou cole o link") → tela de pareamento; some todo o resto da seção Servidor de fotos, menos "Pastas do celular".',
  '• Servidor em http://: o subtítulo do servidor soma "HTTP sem criptografia: fotos e a chave trafegam sem proteção. Use o endereço https:// do servidor quando houver." e o cadeado vira um aviso vermelho.',
  '• Situação: "Ainda não sincronizado"; "{n} decisões esperando para sincronizar"; erros "A última sincronização falhou: o servidor não estava ao alcance" / "O servidor não aceita mais este celular: pareie de novo" / "A última sincronização falhou ({erro})" / "O servidor recusou algumas decisões; elas serão enviadas de novo mais tarde ({erro})". "Sincronizar agora" fica desativado enquanto sincroniza.',
  '• "Comprimir vídeos" (sub "Reduza vídeos na GPU do servidor de fotos") → tela própria: só se o servidor tem o recurso de compressão.',
  '• Backup sem pastas: "Desligado: escolha as pastas do backup". Pastas mapeadas sem nenhuma: "Nenhuma ainda. Abra uma pasta de compartilhamento que o servidor também indexa, e o Hoard a reconhece lendo duas das fotos."',
  '• Armazenamento: "Pastas onde o Hoard pode salvar" (ajuda "O Android deu ao Hoard acesso a estas pastas. Libere uma para revogar o acesso.", uma linha por pasta com "Liberar"): só se o Android deu pastas pelo seletor. Acesso desligado: "Desligado: só suas máquinas e unidades escolhidas uma a uma."',
  '• Lixeira: Android < 12 "Precisa do Android 12 ou mais recente." (sem botão); não permitido: "Não permitido: o Android pede confirmação toda vez que o Hoard move fotos do celular para a lixeira dele." + "Permitir".',
  '• Cópias / links do Reveal vazios: "Nenhuma cópia neste celular." / "O Reveal não tem links para arquivos do Hoard." (sem botão); "Contando…" enquanto carrega.',
  '• A ajuda de "Se o arquivo já existir" muda com a opção; o texto de "Direção da ordem" muda com a ordem (Tamanho: Menores/Maiores primeiro; Modificado: Mais antigos/Mais recentes primeiro).',
].join('\n');

const root: N[] = [
  { 'top-app-bar': { title: 'Configurações', leading: 'back', actions: 0 }, note: other },
  {
    vstack: [
      // 1. Servidor de fotos (pareado)
      section('Servidor de fotos'),
      help('O hoard-server guarda sua biblioteca: o Hoard mostra os itens dele na Galeria e sincroniza suas escolhas e estrelas com o Reveal e a galeria web.'),
      row('hoard-server', { sub: 'Versão 1.6.0 · https://hoard.casa.ts.net', icon: 'Lock', trailing: 'value', value: 'Endereço' }),
      row('Situação', { sub: 'Sincronizado há 2 min · 12.480 itens no servidor', icon: 'CircleCheck' }),
      button('Sincronizar agora', 'secondary'),
      row('Este celular', { sub: 'Agrupado com Reveal', icon: 'Smartphone' }),
      row('Backup do celular', { sub: '2 pastas · 1.204 de 1.310 com backup · 3,2 GB liberados · 1.204 arquivos', icon: 'Upload', trailing: 'chevron' }),
      row('Cache de prévias', { sub: '312 MB de 1,1 GB', icon: 'Database', trailing: 'value', value: 'Limpar cache' }),
      radio('Limite do cache', ['256 MB', '1,1 GB', '4,3 GB'], 2),
      row('Miniaturas offline', { sub: '12.480 de 12.480 itens · 140 MB', icon: 'Images', trailing: 'value', value: 'Limpar cache' }),
      { checkbox: { label: 'Guardar miniaturas pequenas da biblioteca inteira (só no Wi-Fi)', checked: true } },
      { checkbox: { label: 'Só carregando', checked: false } },
      row('Originais guardados', { sub: 'Fotos que você abriu, guardadas neste celular: 640 MB de 2 GiB', icon: 'HardDrive', trailing: 'value', value: 'Limpar cache' }),
      radio('', ['512 MiB', '2 GiB', '8 GiB'], 2),
      row('Pastas mapeadas', {
        sub: 'Pastas de compartilhamentos que o servidor também indexa: as fotos delas vão para o Reveal a partir do servidor, e suas escolhas e estrelas sincronizam como as da Galeria.',
        icon: 'FolderSync',
      }),
      row('nas › fotos/2024', { sub: 'No servidor: /srv/fotos/2024', trailing: 'value', value: 'Esquecer' }),
      row('Desparear', { icon: 'Unlink', trailing: 'chevron' }),
      row('Pastas do celular', { sub: 'Câmera, Imagens, Filmes e WhatsApp sempre aparecem', icon: 'Folder' }),
      row('/storage/emulated/0/Telegram', { icon: 'X' }),
      button('Adicionar uma pasta'),
      { divider: {} },
      // 2–4. Tema, Paleta, Idioma
      section('Tema'),
      radio('', ['Sistema', 'Claro', 'Escuro'], 1),
      section('Paleta'),
      radio('', ['Azul', 'Oliva', 'Violeta', 'Rosa', 'Grafite'], 1),
      section('Idioma'),
      radio('', ['Idioma do sistema', 'English', 'Português (Brasil)'], 1),
      { divider: {} },
      // 5. Navegação
      section('Navegação'),
      { toggle: { label: 'Mostrar arquivos ocultos', description: 'Arquivos e pastas que começam com ponto ou estão marcados como ocultos no servidor.', on: false } },
      radio('Ordem padrão', ['Nome', 'Tamanho', 'Modificado'], 1),
      radio('Direção da ordem', ['De A a Z', 'De Z a A'], 1),
      help('As pastas sempre aparecem antes dos arquivos.'),
      { divider: {} },
      // 6. Transferências
      section('Transferências'),
      radio('Se o arquivo já existir', ['Perguntar (padrão)', 'Manter os dois', 'Substituir', 'Pular'], 1),
      help('Mostra uma pergunta, com “aplicar a todos”.'),
      radio('Tempo limite da verificação de caminho', ['0,8 s', '1,5 s (padrão)', '3 s', '5 s'], 2),
      help('Quanto o Hoard espera cada endereço responder. Aumente em redes lentas.'),
      { divider: {} },
      // 7. Armazenamento do telefone
      section('Armazenamento do telefone'),
      row('Acesso a todos os arquivos', { sub: 'Permitido: o Hoard navega no telefone, em pendrives e cartões SD.', icon: 'HardDrive', trailing: 'value', value: 'Alterar' }),
      { divider: {} },
      // 8. Fotos copiadas para o Reveal
      section('Fotos copiadas para o Reveal'),
      row('3 fotos, 84 MB', {
        sub: 'Fotos de compartilhamentos, drives e cartões SD que "Editar no Reveal" copiou para Pictures/Hoard. Ficam até você apagá-las; editar a mesma foto de novo reaproveita a cópia.',
        icon: 'Copy',
      }),
      button('Apagar cópias'),
      { divider: {} },
      // 9. Links do Reveal
      section('Links do Reveal'),
      row('O Reveal pode reabrir 5 arquivos enviados pelo Hoard, mesmo depois de reiniciar.', {
        sub: 'Fotos abrem no Reveal, o editor de RAW, a partir do navegador de arquivos e da seleção ("Editar no Reveal").',
        icon: 'Link',
      }),
      button('Revogar todos'),
      { divider: {} },
      // 10. Lixeira
      section('Lixeira'),
      row('Abrir a lixeira', { icon: 'Trash2', trailing: 'chevron' }),
      radio('Esvaziar a lixeira automaticamente', ['Depois de 7 dias', 'Depois de 30 dias', 'Depois de 90 dias', 'Nunca'], 2),
      help('Os dias na lixeira são apagados depois disso, em todo compartilhamento e drive que o Hoard alcançar.'),
      row('Gerenciamento de mídia', { sub: 'Permitido: o Android não pergunta antes de cada envio para a lixeira, restauração ou exclusão.', icon: 'ShieldCheck', trailing: 'value', value: 'Alterar' }),
      { divider: {} },
      // 11. Seleção de fotos
      section('Seleção de fotos'),
      help('Assistência na seleção (o que conta como desfocada ou olhos fechados, como as sequências são agrupadas) e como "Exportar XMP" nomeia os arquivos.'),
      label('Fotos desfocadas'),
      chips(['Baixa', 'Média', 'Alta'], 2),
      help('Mais alto marca também fotos um pouco suaves; mais baixo só as claramente desfocadas.'),
      label('Olhos fechados'),
      chips(['Baixa', 'Média', 'Alta'], 2),
      help('Mais alto marca também olhos semicerrados. Só contam rostos grandes o bastante para importar.'),
      label('Intervalo da sequência'),
      chips(['0,5 s', '1 s', '2 s', '3 s'], 2),
      help('Fotos tiradas com menos que isso de diferença começam uma sequência (uma cena nova a divide). Quadros quase idênticos até quatro vezes mais distantes entram nela.'),
      {
        toggle: {
          label: 'Gravar o XMP como arquivo oculto (.nome.xmp)',
          description: '"Exportar XMP" nomeia os novos arquivos com um ponto para ficarem ocultos. O Reveal e o digiKam os leem; o Lightroom não. O Hoard não grava mais arquivos XMP sozinho.',
          on: false,
        },
      },
      { divider: {} },
      // 12. Sobre
      section('Sobre'),
      row('Versão', { trailing: 'value', value: '2.7.1' }),
      row('Dados do Hoard 1', { sub: 'Nada para importar (instalação nova)' }),
      help('O Hoard é software livre e de código aberto, sob a licença GNU AGPL 3.0 ou posterior.'),
      row('Código-fonte', { sub: 'github.com/henriquefps/hoard', icon: 'ExternalLink' }),
      row('Licença (AGPL-3.0)', { icon: 'ExternalLink' }),
      row('Licenças de código aberto', { sub: 'O Hoard é software livre (AGPL-3.0)', trailing: 'chevron' }),
    ],
    gap: 8,
    padding: 16,
  },
];

const spec = {
  $schema: 'https://designer.hfps.dev/schema/wireframe-spec.schema.json',
  version: 1,
  name: 'Hoard',
  screens: [{ name: 'Configurações', status: 'current', platform: 'phone', root }],
};
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'configuracoes-atual.spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
