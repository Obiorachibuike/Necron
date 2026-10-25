import { $, desktop, setText } from "./common.js";

const target = $("#loading-target");
const note = $("#loading-note");

if (!desktop) {
  setText(target, "This page only works inside the CareerPilot desktop app.");
} else {
  desktop
    .getState()
    .then((state) => {
      if (state?.serverUrl) {
        setText(target, `Loading ${state.serverUrl}`);
        if (!state.packaged) {
          setText(note, "Development build — server checks and DevTools are enabled.");
        }
      } else {
        setText(target, "No workspace is connected yet.");
      }
    })
    .catch(() => undefined);
}
