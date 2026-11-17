<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Axiom-EMS)

- Seed data and shared types live in `src/lib/axiom/`; screens read from there so the later simulator/realtime layer can replace the mock source in one place.
- Leaflet code lives only in `src/components/axiom/CorridorMap.tsx`, loaded lazily via `MapFrame` behind `<ClientOnly>`; Leaflet touches `window` at import time and breaks SSR otherwise.
- Map tiles use Esri Canvas (light/dark gray) because CARTO and OSM tile servers return placeholder/blocked tiles from shared hosts.
- Leaflet SVG strokes are themed via CSS classes (`axm-path-*`), not `color` options, so they follow design tokens and dark mode.
- `cn()` registers the custom font sizes (`text-title`, `text-display`, `text-hero`) with tailwind-merge; without it they are treated as colors and strip text color classes.
- Control Room dark mode toggles `.dark` on `<html>` from the control layout and removes it on unmount, so phone screens always stay light.
- The control room tabs are separate routes under `/control/*` sharing the `control.tsx` layout (sidebar, top bar, KPI strip).
