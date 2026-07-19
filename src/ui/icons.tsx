// Icon set rendered as Nerd Font glyphs (fonts/SymbolsNerdFont-Regular.ttf,
// loaded via @font-face as 'Symbols Nerd Font'). Sizes are converted to rem
// so icons scale typographically with the rest of the interface.

export const Icon = ({ glyph, size = 16, className = '' }: {
  glyph: string; size?: number; className?: string;
}): React.ReactElement => (
  <span
    className={`nf-icon ${className}`}
    style={{ fontSize: `${size / 16}rem` }}
    aria-hidden="true"
  >
    {glyph}
  </span>
);

type P = { size?: number; className?: string };

const make = (glyph: string) => (p: P): React.ReactElement => <Icon glyph={glyph} {...p} />;

export const PlayIcon = make('');       // nf-fa-play
export const StopIcon = make('');       // nf-fa-stop
export const PencilIcon = make('');     // nf-fa-pencil
export const BrushIcon = make('');      // nf-fa-paint_brush
export const ScissorsIcon = make('');   // nf-fa-scissors
export const MuteIcon = make('');       // nf-fa-volume_off
export const SelectIcon = make('');     // nf-fa-square_o
export const UndoIcon = make('');       // nf-fa-undo
export const RedoIcon = make('');       // nf-fa-repeat
export const SaveIcon = make('');       // nf-fa-floppy_o
export const FolderOpenIcon = make(''); // nf-fa-folder_open
export const FilePlusIcon = make('');   // nf-fa-file_o
export const DownloadIcon = make('');   // nf-fa-download
export const MusicIcon = make('');      // nf-fa-music
export const WaveIcon = make('');       // nf-fa-area_chart
export const SplineIcon = make('');     // nf-fa-line_chart
export const SpeakerIcon = make('');    // nf-fa-volume_up
export const LoopIcon = make('');       // nf-fa-refresh
