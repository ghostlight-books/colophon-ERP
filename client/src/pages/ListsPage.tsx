import { useEffect, useMemo, useState } from "react";

import SurfaceCard from "../components/ui/SurfaceCard";
import {
  boardOptions,
  createListItem,
  formatAssignmentMeta,
  getCurrentAssignerName,
  readBoards,
  writeBoards,
  type BoardKey,
  type BoardState,
} from "../utils/listsStore";

function ListsPage(): JSX.Element {
  const [activeBoard, setActiveBoard] = useState<BoardKey>("scott");
  const [targetBoard, setTargetBoard] = useState<BoardKey>("scott");
  const [newItemText, setNewItemText] = useState("");
  const [boards, setBoards] = useState<BoardState>(() => readBoards());

  useEffect(() => {
    writeBoards(boards);
  }, [boards]);

  useEffect(() => {
    setTargetBoard(activeBoard);
  }, [activeBoard]);

  const activeItems = boards[activeBoard];
  const totalOpen = useMemo(
    () => boardOptions.reduce((sum, board) => sum + boards[board.key].filter((item) => !item.done).length, 0),
    [boards],
  );

  const addItem = (): void => {
    const text = newItemText.trim();
    if (!text) {
      return;
    }

    const item = createListItem(text, targetBoard, getCurrentAssignerName());

    setBoards((current) => ({
      ...current,
      [targetBoard]: [item, ...current[targetBoard]],
    }));

    setNewItemText("");
  };

  const toggleItem = (boardKey: BoardKey, id: string): void => {
    setBoards((current) => ({
      ...current,
      [boardKey]: current[boardKey].map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    }));
  };

  const removeItem = (boardKey: BoardKey, id: string): void => {
    setBoards((current) => ({
      ...current,
      [boardKey]: current[boardKey].filter((item) => item.id !== id),
    }));
  };

  const clearCompleted = (boardKey: BoardKey): void => {
    setBoards((current) => ({
      ...current,
      [boardKey]: current[boardKey].filter((item) => !item.done),
    }));
  };

  return (
    <section className="grid gap-4">
      <div className="rounded-full bg-white/55 p-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
          {boardOptions.map((board) => (
            <button
              key={board.key}
              type="button"
              onClick={() => setActiveBoard(board.key)}
              className={[
                "rounded-full px-4 py-2.5",
                activeBoard === board.key ? "bg-white text-slate-700 shadow-[0_5px_14px_rgba(76,86,103,0.12)]" : "hover:bg-white/70",
              ].join(" ")}
            >
              {board.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <SurfaceCard className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-slate-700">
              {boardOptions.find((board) => board.key === activeBoard)?.label} Board
            </h3>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
              {activeItems.filter((item) => !item.done).length} open
            </span>
            <button
              type="button"
              onClick={() => clearCompleted(activeBoard)}
              className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Clear Completed
            </button>
          </div>

          <p className="mt-1 text-sm text-slate-500">{boardOptions.find((board) => board.key === activeBoard)?.blurb}</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {activeItems.length === 0 ? (
              <p className="col-span-full rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-500">No items yet for this board.</p>
            ) : (
              activeItems.map((item) => (
                <div key={item.id} className="rounded-xl bg-white/80 p-2.5">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => toggleItem(activeBoard, item.id)}
                      className={[
                        "mt-0.5 grid h-6 w-6 place-items-center rounded-full border text-xs",
                        item.done ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-300 bg-white text-slate-500",
                      ].join(" ")}
                    >
                      {item.done ? "✓" : ""}
                    </button>
                    <p className={[
                      "flex-1 text-sm leading-snug",
                      item.done ? "text-slate-400 line-through" : "text-slate-700",
                    ].join(" ")}>
                      {item.text}
                      <span className="block pt-0.5 text-[11px] text-slate-400 no-underline">{formatAssignmentMeta(item)}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeItem(activeBoard, item.id)}
                      className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4">
          <h3 className="text-lg font-semibold text-slate-700">Add To Any List</h3>
          <p className="mt-1 text-sm text-slate-500">Use this to add tasks to your own list or someone else&apos;s board.</p>

          <div className="mt-3 grid gap-2">
            <label className="grid gap-1 text-xs text-slate-600">
              Target Board
              <select
                value={targetBoard}
                onChange={(event) => setTargetBoard(event.target.value as BoardKey)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                {boardOptions.map((board) => (
                  <option key={board.key} value={board.key}>
                    {board.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              Task
              <textarea
                value={newItemText}
                onChange={(event) => setNewItemText(event.target.value)}
                placeholder="Add a list item"
                rows={4}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
              />
            </label>

            <button
              type="button"
              onClick={addItem}
              className="rounded-full bg-[#e9ff63] px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Add Item
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-white/70 px-3 py-2">
            <p className="text-xs text-slate-500">Store-wide open tasks</p>
            <p className="text-xl font-semibold text-slate-700">{totalOpen}</p>
          </div>
        </SurfaceCard>
      </div>
    </section>
  );
}

export default ListsPage;
