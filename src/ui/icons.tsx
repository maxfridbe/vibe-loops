// Inline SVG icon set, following the vibe_sheet ui.tsx paradigm.

export const Icon = ({ size = 16, className = '', children }: {
  size?: number; className?: string; children?: React.ReactNode;
}): React.ReactElement => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}
  >
    {children}
  </svg>
);

type P = { size?: number; className?: string };

export const PlayIcon = (p: P): React.ReactElement => <Icon {...p}><polygon points="5 3 19 12 5 21 5 3" /></Icon>;
export const StopIcon = (p: P): React.ReactElement => <Icon {...p}><rect x="5" y="5" width="14" height="14" rx="1" /></Icon>;
export const PencilIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></Icon>;
export const BrushIcon = (p: P): React.ReactElement => <Icon {...p}><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" /></Icon>;
export const ScissorsIcon = (p: P): React.ReactElement => <Icon {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" /></Icon>;
export const MuteIcon = (p: P): React.ReactElement => <Icon {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></Icon>;
export const SelectIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M5 3a2 2 0 0 0-2 2" /><path d="M19 3a2 2 0 0 1 2 2" /><path d="M21 19a2 2 0 0 1-2 2" /><path d="M5 21a2 2 0 0 1-2-2" /><line x1="9" y1="3" x2="15" y2="3" /><line x1="9" y1="21" x2="15" y2="21" /><line x1="3" y1="9" x2="3" y2="15" /><line x1="21" y1="9" x2="21" y2="15" /></Icon>;
export const UndoIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></Icon>;
export const RedoIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></Icon>;
export const SaveIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></Icon>;
export const FolderOpenIcon = (p: P): React.ReactElement => <Icon {...p}><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" /></Icon>;
export const FilePlusIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></Icon>;
export const DownloadIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Icon>;
export const MusicIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></Icon>;
export const WaveIcon = (p: P): React.ReactElement => <Icon {...p}><path d="M2 12h2l2-7 3 14 3-10 2 5 2-2h6" /></Icon>;
export const SplineIcon = (p: P): React.ReactElement => <Icon {...p}><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 18.5C13 17 17 11 18.5 7" /></Icon>;
export const SpeakerIcon = (p: P): React.ReactElement => <Icon {...p}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></Icon>;
export const LoopIcon = (p: P): React.ReactElement => <Icon {...p}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></Icon>;
