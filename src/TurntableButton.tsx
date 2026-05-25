import { Pause, Play } from "lucide-react";

interface Props {
  playing: boolean;
  onToggle: () => void;
}

export default function TurntableButton({ playing, onToggle }: Props) {
  return (
    <button
      className="corner-btn"
      type="button"
      onClick={onToggle}
      title={playing ? "Pause rotation" : "Resume rotation"}
      aria-label={playing ? "Pause rotation" : "Resume rotation"}
    >
      {playing ? (
        <Pause size={14} strokeWidth={1.75} aria-hidden />
      ) : (
        <Play size={14} strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
