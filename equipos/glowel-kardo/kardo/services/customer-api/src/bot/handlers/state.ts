import type {
  ExperienceContent,
  ItemAvailabilityChange,
} from "@kardo/contracts";

export type UndoAction =
  | {
      kind: "availability";
      workspaceId: string;
      experienceId: string;
      previousItems: ItemAvailabilityChange[];
      description: string;
    }
  | {
      kind: "experience_content";
      workspaceId: string;
      experienceId: string;
      previousName: string;
      previousContent: ExperienceContent;
      description: string;
    };

export interface ChatSessionState {
  preferredExperienceId?: string;
  itemIndexMap: string[];
  lastUndo?: UndoAction;
}

export class BotStateStore {
  private readonly sessions = new Map<string, ChatSessionState>();

  public get(chatId: string): ChatSessionState {
    let s = this.sessions.get(chatId);
    if (!s) {
      s = { itemIndexMap: [] };
      this.sessions.set(chatId, s);
    }
    return s;
  }

  public setItemIndexMap(chatId: string, itemIds: string[]): void {
    const s = this.get(chatId);
    s.itemIndexMap = [...itemIds];
  }

  public getItemIdByIndex(chatId: string, index: number): string | undefined {
    return this.get(chatId).itemIndexMap[index];
  }

  public setPreferredExperience(chatId: string, experienceId: string): void {
    const s = this.get(chatId);
    s.preferredExperienceId = experienceId;
  }

  public setUndo(chatId: string, undo: UndoAction): void {
    const s = this.get(chatId);
    s.lastUndo = undo;
  }

  public popUndo(chatId: string): UndoAction | undefined {
    const s = this.get(chatId);
    const u = s.lastUndo;
    delete s.lastUndo;
    return u;
  }
}

