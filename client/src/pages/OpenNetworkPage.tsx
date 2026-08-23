function OpenNetworkPage(): JSX.Element {
  const partners = [
    { name: "Riverlight Books", status: "Connected", focus: "Inventory swaps" },
    { name: "Juniper Shelf", status: "Pending", focus: "Event cross-promotion" },
    { name: "Maple Street Books", status: "Connected", focus: "Shared hard-to-find requests" },
  ];

  const updates = [
    "Broadcast upcoming author events to partner stores.",
    "Share overstock and rare-title availability across the network.",
    "Coordinate regional promotions and indie store reading campaigns.",
  ];

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Open Network</h2>
            <p className="mt-1 text-sm text-slate-500">
              Shared database and communications hub for independent bookstores.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Invite Store
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Partner Stores</h3>
          <div className="mt-4 space-y-3">
            {partners.map((partner) => (
              <article key={partner.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-semibold text-slate-800">{partner.name}</h4>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      partner.status === "Connected" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                    ].join(" ")}
                  >
                    {partner.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{partner.focus}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Network Activity</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Active Stores</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">18</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Shared Requests</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">42</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">Open Messages</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">11</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Suggested Uses</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {updates.map((update) => (
                <li key={update} className="rounded-xl bg-slate-50 px-3 py-2">
                  {update}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export default OpenNetworkPage;
