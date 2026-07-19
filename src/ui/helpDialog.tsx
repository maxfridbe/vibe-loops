// Keyboard-shortcut and mouse-interaction reference, opened with `?` or the
// help button in the ribbon.

interface HelpDialogProps {
  onClose: () => void;
}

const KEYS: Array<[string, string]> = [
  ['Space', 'play from the playhead / stop (playhead stays where it stopped)'],
  ['Ctrl+Space', 'play from the beginning of the arrangement'],
  ['Ctrl+Z', 'undo'],
  ['Ctrl+Shift+Z / Ctrl+Y', 'redo'],
  ['Delete / Backspace', 'delete the selected clips'],
  ['P', 'Draw tool — place and move clips'],
  ['B', 'Paint tool — stamp repeated clips'],
  ['C', 'Slice tool — split clips'],
  ['T', 'Mute tool — toggle clips silent'],
  ['E', 'Select tool — marquee selection'],
  ['S', 'Stretch tool — time-stretch clips in place'],
  ['Alt (hold)', 'bypass grid snapping during any drag'],
  ['?', 'show this reference'],
];

const MOUSE: Array<[string, string]> = [
  ['click empty lane (Draw)', 'place the focused loop or automation clip'],
  ['drag a clip', 'move it across time and tracks'],
  ['drag a clip edge', 'resize; the left edge trims (audio stays in place)'],
  ['drag edge with Stretch tool', 'time-stretch the audio in place (0.25×–4×, pitch preserved)'],
  ['Shift+drag a clip', 'slip — shift the audio inside the clip'],
  ['right-click a clip', 'delete it'],
  ['click / drag the bar ruler', 'seek / scrub the playhead'],
  ['envelope mode: click a clip', 'add an envelope point and drag it'],
  ['envelope mode: right-click a point', 'remove it (an end point clears the envelope)'],
  ['envelope / automation: drag square handle', 'bend the segment (tension)'],
  ['Ctrl+click an automation curve', 'add an automation point'],
  ['browser: click a loop', 'focus it for the draw/paint tools'],
  ['browser: hover ▶', 'preview the loop (respects master volume)'],
  ['browser: double-click a loop', 'rename it'],
  ['browser: drag a loop onto the playlist', 'place it as a clip'],
  ['track header: double-click the name', 'rename the track'],
  ['track header: click the color swatch', 'change the track color'],
];

const TOUCH: Array<[string, string]> = [
  ['tap an empty lane (Draw)', 'place the focused clip (drag scrolls instead)'],
  ['drag a clip / its edges', 'move, resize or stretch — same as with a mouse'],
  ['long-press a clip or point', 'delete / remove it (same as right-click)'],
  ['double-tap an automation clip', 'add an automation point'],
  ['browser: pull a loop sideways', 'drag it to the playlist; swipe up/down to scroll the list'],
];

export const HelpDialog = ({ onClose }: HelpDialogProps): React.ReactElement => (
  <div className="vl-modal-backdrop" onMouseDown={onClose}>
    <div className="vl-modal vl-modal-wide vl-help" onMouseDown={e => e.stopPropagation()}>
      <div className="vl-modal-title">Keyboard shortcuts &amp; mouse reference</div>
      <div className="vl-help-columns">
        <div>
          <div className="vl-help-heading">keyboard</div>
          <table className="vl-help-table">
            <tbody>
              {KEYS.map(([k, d]) => (
                <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="vl-help-heading">mouse</div>
          <table className="vl-help-table">
            <tbody>
              {MOUSE.map(([k, d]) => (
                <tr key={k}><td className="vl-help-action">{k}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="vl-help-heading" style={{ marginTop: '1em' }}>touch</div>
          <table className="vl-help-table">
            <tbody>
              {TOUCH.map(([k, d]) => (
                <tr key={k}><td className="vl-help-action">{k}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="vl-modal-buttons">
        <button className="primary" onClick={onClose}>close (Esc)</button>
      </div>
    </div>
  </div>
);
