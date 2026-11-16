// Automation hook for recording walkthrough videos (scripts/demo/). A script can
// switch person, load a scenario and turn presenter mode on without opening the
// demo panel. Each call goes through `actions`, like a click on the panel would.

import { actions } from "@/domain/actions";
import type { ScenarioId } from "@/domain/types";

export interface FemmecareDemoHook {
  signInStaff: (userId: string) => ReturnType<typeof actions.signInStaff>;
  signInConsultant: (consultantId: string) => ReturnType<typeof actions.signInConsultant>;
  loadScenario: (id: ScenarioId) => void;
  setPresenterMode: (on: boolean) => ReturnType<typeof actions.setPresenterMode>;
}

declare global {
  interface Window {
    __femmecareDemo?: FemmecareDemoHook;
  }
}

window.__femmecareDemo = {
  signInStaff: (userId) => actions.signInStaff(userId),
  signInConsultant: (consultantId) => actions.signInConsultant(consultantId),
  loadScenario: (id) => actions.loadScenario(id),
  setPresenterMode: (on) => actions.setPresenterMode(on),
};
