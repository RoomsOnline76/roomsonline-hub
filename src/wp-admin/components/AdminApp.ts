/**
 * ROL'OS WP Admin Dashboard App
 * Vanilla JS dashboard for WP admin — housekeeping, check-in/out, metrics, folio viewer
 * Uses the same ROL'OS PMS API via the PHP SDK proxy
 */

interface AdminConfig {
  apiUrl: string;
  anonKey: string;
  propertyId: string;
  nonce: string;
  ajaxUrl: string;
}

export class RolosAdminApp {
  private container: HTMLElement;
  private config: AdminConfig;
  private activeTab: string = "metrics";

  constructor(container: HTMLElement) {
    this.container = container;
    this.config = (window as any).rolosAdminConfig || {};
  }

  async init() {
    this.renderShell();
    await this.loadTab(this.activeTab);
  }

  private renderShell() {
    this.container.innerHTML = `
      <div class="rolos-admin-wrapper" style="font-family:system-ui,-apple-system,sans-serif;">
        <div class="rolos-admin-tabs" style="display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:20px;">
          <button data-tab="metrics" class="rolos-tab active" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-2px;">📊 Daily Metrics</button>
          <button data-tab="housekeeping" class="rolos-tab" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-2px;">🧹 Housekeeping</button>
          <button data-tab="checkinout" class="rolos-tab" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-2px;">🔑 Check-in / Out</button>
          <button data-tab="folio" class="rolos-tab" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-2px;">💳 Folios</button>
        </div>
        <div id="rolos-tab-content" style="min-height:300px;"></div>
      </div>
    `;

    this.container.querySelectorAll<HTMLButtonElement>(".rolos-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.container.querySelectorAll(".rolos-tab").forEach((b) => {
          (b as HTMLElement).style.borderBottomColor = "transparent";
          (b as HTMLElement).style.color = "#6b7280";
        });
        btn.style.borderBottomColor = "#2563eb";
        btn.style.color = "#111827";
        this.activeTab = btn.dataset.tab || "metrics";
        this.loadTab(this.activeTab);
      });
    });

    // Style active tab
    const firstTab = this.container.querySelector('.rolos-tab[data-tab="metrics"]') as HTMLElement;
    if (firstTab) {
      firstTab.style.borderBottomColor = "#2563eb";
      firstTab.style.color = "#111827";
    }
  }

  private async callApi(action: string, params: Record<string, any> = {}) {
    try {
      const resp = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.anonKey}`,
          "apikey": this.config.anonKey,
        },
        body: JSON.stringify({ action, propertyId: this.config.propertyId, ...params }),
      });
      return await resp.json();
    } catch (err) {
      console.error(`[ROL'OS Admin] API error (${action}):`, err);
      return { success: false, error: { message: "Network error" } };
    }
  }

  private async loadTab(tab: string) {
    const content = document.getElementById("rolos-tab-content");
    if (!content) return;

    content.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Loading...</div>';

    switch (tab) {
      case "metrics":
        await this.renderMetrics(content);
        break;
      case "housekeeping":
        await this.renderHousekeeping(content);
        break;
      case "checkinout":
        await this.renderCheckInOut(content);
        break;
      case "folio":
        await this.renderFolio(content);
        break;
    }
  }

  private async renderMetrics(container: HTMLElement) {
    const result = await this.callApi("get_daily_metrics", { date: new Date().toISOString().split("T")[0] });

    if (!result.success) {
      container.innerHTML = `<div class="rolos-admin-card"><p style="color:#dc2626;">Failed to load metrics: ${result.error?.message || "Unknown error"}</p></div>`;
      return;
    }

    const m = result.data || {};
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        ${this.metricCard("🏨 Occupancy", `${m.occupancy_percent ?? 0}%`, "Today's room occupancy")}
        ${this.metricCard("📥 Arrivals", `${m.arrivals ?? 0}`, "Expected check-ins today")}
        ${this.metricCard("📤 Departures", `${m.departures ?? 0}`, "Expected check-outs today")}
        ${this.metricCard("💰 Revenue", `R${(m.revenue ?? 0).toLocaleString()}`, "Today's revenue")}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px;">
        ${this.metricCard("🛏️ Available", `${m.available_rooms ?? 0}`, "Rooms available tonight")}
        ${this.metricCard("🧹 Pending Clean", `${m.pending_clean ?? 0}`, "Rooms needing housekeeping")}
        ${this.metricCard("⚠️ Maintenance", `${m.maintenance_issues ?? 0}`, "Open maintenance requests")}
      </div>
    `;
  }

  private metricCard(icon: string, value: string, label: string): string {
    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:24px;margin-bottom:4px;">${icon}</div>
        <div style="font-size:28px;font-weight:700;color:#111827;">${value}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">${label}</div>
      </div>
    `;
  }

  private async renderHousekeeping(container: HTMLElement) {
    const result = await this.callApi("get_housekeeping_board");

    if (!result.success) {
      container.innerHTML = `<div class="rolos-admin-card"><p style="color:#dc2626;">Failed to load housekeeping board.</p></div>`;
      return;
    }

    const tasks = result.data?.tasks || [];
    if (!tasks.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#6b7280;">✨ All rooms are clean! No pending tasks.</div>`;
      return;
    }

    const statusColors: Record<string, string> = {
      pending: "#fef3c7",
      assigned: "#dbeafe",
      in_progress: "#e0e7ff",
      completed: "#d1fae5",
      verified: "#d1fae5",
    };

    let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="border-bottom:2px solid #e5e7eb;text-align:left;">
        <th style="padding:10px;">Room</th>
        <th style="padding:10px;">Task</th>
        <th style="padding:10px;">Priority</th>
        <th style="padding:10px;">Status</th>
        <th style="padding:10px;">Assigned To</th>
      </tr></thead><tbody>`;

    for (const task of tasks) {
      const bg = statusColors[task.status] || "#f9fafb";
      html += `<tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:10px;font-weight:500;">${task.room_name || task.room_number || "—"}</td>
        <td style="padding:10px;">${task.task_type || "clean"}</td>
        <td style="padding:10px;"><span style="padding:2px 8px;border-radius:4px;font-size:12px;background:${task.priority === "emergency" ? "#fecaca" : task.priority === "high" ? "#fed7aa" : "#f3f4f6"};">${task.priority || "normal"}</span></td>
        <td style="padding:10px;"><span style="padding:2px 8px;border-radius:4px;font-size:12px;background:${bg};">${task.status}</span></td>
        <td style="padding:10px;color:#6b7280;">${task.assigned_to_name || "Unassigned"}</td>
      </tr>`;
    }

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  }

  private async renderCheckInOut(container: HTMLElement) {
    const today = new Date().toISOString().split("T")[0];
    const [arrivalsResult, departuresResult] = await Promise.all([
      this.callApi("get_todays_arrivals", { date: today }),
      this.callApi("get_todays_departures", { date: today }),
    ]);

    const arrivals = arrivalsResult.data || [];
    const departures = departuresResult.data || [];

    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">`;

    // Arrivals
    html += `<div>
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;">📥 Today's Arrivals (${Array.isArray(arrivals) ? arrivals.length : 0})</h3>`;

    if (Array.isArray(arrivals) && arrivals.length) {
      for (const a of arrivals) {
        const isCheckedIn = a.status === "checked_in";
        html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:500;">${a.guest_name || "Guest"}</div>
            <div style="font-size:13px;color:#6b7280;">${a.room_name || ""} · ${a.nights || 0} nights</div>
          </div>
          ${isCheckedIn
            ? '<span style="padding:4px 10px;background:#d1fae5;color:#065f46;border-radius:6px;font-size:12px;font-weight:500;">Checked In ✓</span>'
            : `<button class="rolos-checkin-btn" data-booking-id="${a.booking_id}" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Check In</button>`
          }
        </div>`;
      }
    } else {
      html += `<p style="color:#6b7280;font-size:14px;">No arrivals today.</p>`;
    }
    html += `</div>`;

    // Departures
    html += `<div>
      <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;">📤 Today's Departures (${Array.isArray(departures) ? departures.length : 0})</h3>`;

    if (Array.isArray(departures) && departures.length) {
      for (const d of departures) {
        const isCheckedOut = d.status === "checked_out";
        html += `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:500;">${d.guest_name || "Guest"}</div>
            <div style="font-size:13px;color:#6b7280;">${d.room_name || ""} · Balance: R${(d.balance || 0).toLocaleString()}</div>
          </div>
          ${isCheckedOut
            ? '<span style="padding:4px 10px;background:#d1fae5;color:#065f46;border-radius:6px;font-size:12px;font-weight:500;">Checked Out ✓</span>'
            : `<button class="rolos-checkout-btn" data-booking-id="${d.booking_id}" style="padding:6px 14px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Check Out</button>`
          }
        </div>`;
      }
    } else {
      html += `<p style="color:#6b7280;font-size:14px;">No departures today.</p>`;
    }
    html += `</div></div>`;

    container.innerHTML = html;

    // Bind check-in/out buttons
    container.querySelectorAll<HTMLButtonElement>(".rolos-checkin-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Processing...";
        const result = await this.callApi("check_in", { bookingId: btn.dataset.bookingId });
        if (result.success) {
          btn.outerHTML = '<span style="padding:4px 10px;background:#d1fae5;color:#065f46;border-radius:6px;font-size:12px;font-weight:500;">Checked In ✓</span>';
        } else {
          btn.disabled = false;
          btn.textContent = "Check In";
          alert("Check-in failed: " + (result.error?.message || "Unknown error"));
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>(".rolos-checkout-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Process check-out? This will finalize the folio and process any refundable deposits.")) return;
        btn.disabled = true;
        btn.textContent = "Processing...";
        const result = await this.callApi("check_out", { bookingId: btn.dataset.bookingId });
        if (result.success) {
          btn.outerHTML = '<span style="padding:4px 10px;background:#d1fae5;color:#065f46;border-radius:6px;font-size:12px;font-weight:500;">Checked Out ✓</span>';
        } else {
          btn.disabled = false;
          btn.textContent = "Check Out";
          alert("Check-out failed: " + (result.error?.message || "Unknown error"));
        }
      });
    });
  }

  private async renderFolio(container: HTMLElement) {
    container.innerHTML = `
      <div style="max-width:500px;">
        <h3 style="font-size:16px;font-weight:600;margin:0 0 12px;">💳 Folio Lookup</h3>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <input id="rolos-folio-booking-id" type="text" placeholder="Enter Booking ID or Guest Name" style="flex:1;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;" />
          <button id="rolos-folio-search" style="padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Search</button>
        </div>
        <div id="rolos-folio-result"></div>
      </div>
    `;

    document.getElementById("rolos-folio-search")?.addEventListener("click", async () => {
      const input = document.getElementById("rolos-folio-booking-id") as HTMLInputElement;
      const resultDiv = document.getElementById("rolos-folio-result")!;
      const bookingId = input?.value?.trim();
      if (!bookingId) return;

      resultDiv.innerHTML = '<p style="color:#6b7280;">Searching...</p>';

      const result = await this.callApi("get_folio", { bookingId });

      if (!result.success || !result.data) {
        resultDiv.innerHTML = `<p style="color:#dc2626;">Folio not found. Verify the booking ID.</p>`;
        return;
      }

      const folio = result.data;
      const transactions = folio.transactions || [];

      let html = `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
            <div><strong>${folio.guest_name || "Guest"}</strong><br/><span style="font-size:13px;color:#6b7280;">Folio #${folio.folio_number || folio.id?.slice(0, 8)}</span></div>
            <div style="text-align:right;"><span style="font-size:24px;font-weight:700;">R${(folio.balance || 0).toLocaleString()}</span><br/><span style="font-size:12px;color:${folio.balance > 0 ? "#dc2626" : "#065f46"};">${folio.balance > 0 ? "Outstanding" : "Settled"}</span></div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
              <th style="padding:6px 0;">Date</th>
              <th style="padding:6px 0;">Description</th>
              <th style="padding:6px 0;text-align:right;">Amount</th>
            </tr></thead><tbody>
      `;

      for (const tx of transactions) {
        const isCredit = tx.amount < 0;
        html += `<tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:6px 0;">${new Date(tx.created_at).toLocaleDateString()}</td>
          <td style="padding:6px 0;">${tx.description || tx.type}</td>
          <td style="padding:6px 0;text-align:right;color:${isCredit ? "#065f46" : "#111827"};">${isCredit ? "-" : ""}R${Math.abs(tx.amount).toLocaleString()}</td>
        </tr>`;
      }

      html += `</tbody></table></div>`;
      resultDiv.innerHTML = html;
    });
  }
}
