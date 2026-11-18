# Axiom EMS

Implement exactly the screenshot and nothing else

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

