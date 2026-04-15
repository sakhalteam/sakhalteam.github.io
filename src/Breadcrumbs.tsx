// Breadcrumbs.tsx

import { useNavigate } from "react-router-dom";
import { getBreadcrumbs } from "./sceneMap";

/**
 * Breadcrumb trail for zone scenes.
 * Shows: Sakhalteam › Tower of Knowledge › Reading Room
 * Each ancestor is clickable (navigates to its path).
 * The current zone (last crumb) is plain text, not a link.
 */
export default function Breadcrumbs({ zoneKey }: { zoneKey: string }) {
  const navigate = useNavigate();
  const crumbs = getBreadcrumbs(zoneKey);

  if (crumbs.length <= 1) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((node, i) => {
        const isLast = i === crumbs.length - 1;
        const isClickable = !isLast && node.path;

        return (
          <span key={node.key} className="breadcrumb-item">
            {i > 0 && (
              <span className="breadcrumb-sep" aria-hidden="true">
                »
              </span>
            )}
            {isClickable ? (
              <button
                className="breadcrumb-link"
                onClick={() => navigate(node.path!)}
              >
                {node.label}
              </button>
            ) : (
              <span
                className={isLast ? "breadcrumb-current" : "breadcrumb-text"}
              >
                {node.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
