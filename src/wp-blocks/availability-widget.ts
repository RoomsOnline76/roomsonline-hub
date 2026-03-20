/**
 * ROL'OS Availability Widget — Standalone JS
 * Built via Vite library mode → rolos-availability.min.js
 * Loaded by [rolos_availability] shortcode
 */

interface AvailabilityConfig {
  propertyId: string;
  apiUrl: string;
  anonKey: string;
}

interface DayAvailability {
  date: string;
  available: boolean;
  rate?: number;
  minStay?: number;
}

class RolosAvailabilityWidget {
  private container: HTMLElement;
  private propertyId: string;
  private currentMonth: Date;
  private availabilityData: DayAvailability[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.propertyId = container.dataset.propertyId || "";
    this.currentMonth = new Date();
    this.render();
    this.fetchAvailability();
  }

  private async fetchAvailability() {
    // Read config from global or data attributes
    const config = (window as any).rolosAvailConfig as AvailabilityConfig | undefined;
    if (!config?.apiUrl || !this.propertyId) {
      this.renderError("Widget not configured. Set API URL in ROL'OS Settings.");
      return;
    }

    const startDate = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
    const endDate = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 2, 0);

    try {
      const resp = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.anonKey}`,
          "apikey": config.anonKey,
        },
        body: JSON.stringify({
          action: "fetch_availability",
          propertyId: this.propertyId,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        }),
      });

      const data = await resp.json();
      if (data.success && data.data) {
        this.availabilityData = this.parseAvailability(data.data);
      }
    } catch (err) {
      console.error("[ROL'OS] Availability fetch error:", err);
    }

    this.render();
  }

  private parseAvailability(data: any): DayAvailability[] {
    if (Array.isArray(data)) {
      return data.map((d: any) => ({
        date: d.date,
        available: d.available ?? d.units_available > 0,
        rate: d.rate ?? d.price,
        minStay: d.min_stay,
      }));
    }
    return [];
  }

  private render() {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const monthName = this.currentMonth.toLocaleString("default", { month: "long", year: "numeric" });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <button class="rolos-avail-prev" style="border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:14px;">← Prev</button>
          <h3 style="margin:0;font-size:18px;font-weight:600;">${monthName}</h3>
          <button class="rolos-avail-next" style="border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:14px;">Next →</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;">
    `;

    // Day headers
    for (const day of dayNames) {
      html += `<div style="padding:8px 0;font-size:12px;font-weight:600;color:#6b7280;">${day}</div>`;
    }

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      html += `<div></div>`;
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayData = this.availabilityData.find((a) => a.date === dateStr);
      const isAvailable = dayData?.available ?? true;
      const rate = dayData?.rate;
      const today = new Date();
      const isPast = new Date(dateStr) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const bgColor = isPast ? "#f9fafb" : isAvailable ? "#ecfdf5" : "#fef2f2";
      const textColor = isPast ? "#d1d5db" : isAvailable ? "#065f46" : "#991b1b";

      html += `
        <div style="padding:8px 4px;border-radius:6px;background:${bgColor};cursor:${isPast ? "default" : "pointer"};">
          <div style="font-size:14px;font-weight:500;color:${textColor};">${d}</div>
          ${rate && !isPast ? `<div style="font-size:10px;color:#6b7280;">R${Math.round(rate)}</div>` : ""}
        </div>
      `;
    }

    html += `</div>
        <div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:#6b7280;">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:#ecfdf5;border-radius:3px;border:1px solid #a7f3d0;"></span> Available</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:#fef2f2;border-radius:3px;border:1px solid #fecaca;"></span> Unavailable</span>
        </div>
      </div>
    `;

    this.container.innerHTML = html;

    // Bind navigation
    this.container.querySelector(".rolos-avail-prev")?.addEventListener("click", () => {
      this.currentMonth = new Date(year, month - 1, 1);
      this.fetchAvailability();
    });
    this.container.querySelector(".rolos-avail-next")?.addEventListener("click", () => {
      this.currentMonth = new Date(year, month + 1, 1);
      this.fetchAvailability();
    });
  }

  private renderError(message: string) {
    this.container.innerHTML = `
      <div style="padding:20px;text-align:center;color:#6b7280;font-family:system-ui,sans-serif;">
        <p>${message}</p>
      </div>
    `;
  }
}

// Auto-init all widgets on page
function initAvailabilityWidgets() {
  document.querySelectorAll<HTMLElement>(".rolos-availability-widget").forEach((el) => {
    if (!el.dataset.rolosInit) {
      el.dataset.rolosInit = "true";
      new RolosAvailabilityWidget(el);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAvailabilityWidgets);
} else {
  initAvailabilityWidgets();
}

export { RolosAvailabilityWidget };
