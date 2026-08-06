// Lightweight setup entry. OpenClaw discovers package-root `setup-api.js`
// for descriptor-backed setup without loading the full runtime entry.
import { registerAntigravity } from "./src/register.js";

export default {
  id: "antigravity",
  name: "Antigravity CLI Setup",
  description: "Setup hooks for the Antigravity CLI provider.",
  register: registerAntigravity,
};
