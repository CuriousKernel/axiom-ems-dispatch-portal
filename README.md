# Axiom EMS - Delhi Traffic Police Emergency Corridor Coordination

[![Deploy Preview](https://img.shields.io/badge/🚀_Live_Demo-Open_Axiom--EMS-blue?style=for-the-badge)](https://lovable.dev/projects/6181689c-b06b-4c59-abe4-e2ce69695756)
[![3-in-1 Presenter Demo](https://img.shields.io/badge/🎯_Presenter_Demo-3--in--1_Coordination-emerald?style=for-the-badge)](https://lovable.dev/projects/6181689c-b06b-4c59-abe4-e2ce69695756)

---

### 🌐 Direct Launch & Deploy Links
- **[Launch Live Cloud Application (Lovable)](https://lovable.dev/projects/6181689c-b06b-4c59-abe4-e2ce69695756)** — One-click interactive cloud preview with live AI vision and real-time simulator.
- **[Local 3-in-1 Judge Demo](http://127.0.0.1:3000/demo)** — Full synchronized 3-viewport demo (Control Room, Ambulance Driver HUD, Traffic Officer mobile).
- **[GitHub Repository](https://github.com/CuriousKernel/axiom-ems-dispatch-portal)** — Source code & branch `fix-demo-flow`.

---

Axiom-EMS is an intelligent emergency vehicle corridor dispatch and coordination system designed for Delhi Traffic Police. It coordinates three mission-critical stakeholders in real time:
- **Control Room Dispatcher (Laptop / Command Centre)**: Oversees corridor health, ambulance movement, AI optical queue metrics, and automated escalation.
- **Traffic Officer (Smartphone)**: Receives instantaneous location-bound junction alerts, 3-step action workflows (Acknowledge, In Position, Verified Clear), and fail-safe escalations.
- **Ambulance Driver (Smartphone HUD)**: Turn-by-turn waypoint navigation, upcoming corridor status (Clear / Watch / Critical), and automated diversion routes.

> **Notice**: Simulation data is generated realistically based on the Connaught Place to AIIMS Hospital emergency corridor along Mathura Road and Barapullah / Ring Road.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6181689c-b06b-4c59-abe4-e2ce69695756).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Demo Setup (Judging & Presentation)

Axiom-EMS supports two demo modes depending on your setup:

### Option A: 3-in-1 Unified Demo (Recommended for Single Laptop / Screen)
Navigate to `/demo` in your browser.
- **How it works**: Displays the Control Room, Ambulance Driver HUD, and Traffic Officer screens in three side-by-side viewports inside a single desktop window.
- **Zero Configuration**: Uses the browser's native `BroadcastChannel` for instantaneous synchronization between the three iframes.
- **No Background Throttling**: Because all three screens live in active iframes in one window, browser timers are never throttled by background tab power-saving features.
- Includes an interactive **Presenter Checklist** guiding judges through a complete 2-minute emergency dispatch and clearance sequence.

### Option B: Multi-Device / Real Phones Setup
To demonstrate with a laptop for the Control Room and physical smartphones for the Driver and Officer:
1. Supply Supabase credentials in your `.env` (or environment variables):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
2. With these variables set, Axiom-EMS switches transport to Supabase Realtime Broadcast (`corridor-sim` channel). State changes and commands sync seamlessly across physical devices over the internet.
3. **Limitation notice**: Without `VITE_SUPABASE_*` credentials, the application automatically falls back to local `BroadcastChannel`. In local mode, synchronization works across tabs and iframes within the same browser profile on one device, but cannot bridge physical devices without a shared backend channel.

