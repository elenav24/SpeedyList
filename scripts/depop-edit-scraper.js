(() => {
  "use strict";

  const CONFIG = {
    storageKey: "speedlist.pendingListing",
    messageType: "speedlist:scrape-listing",
    conditionMap: {
      "Excellent": "Very good",
      "Used - Excellent": "Very good",
      "Like new": "Very good",
      "Good": "Good",
      "Used - Good": "Good",
      "Fair": "Satisfactory",
      "Used - Fair": "Satisfactory",
      "New": "New without tags",
      "Brand new": "New without tags",
      "New without tags": "New without tags",
      "New with tags": "New with tags"
    },
    fields: {
      description: {
        selectors: ['textarea[name*="description" i]', 'textarea[id*="description" i]', 'textarea[placeholder*="description" i]', '[contenteditable="true"][aria-label*="description" i]', '[role="textbox"][aria-label*="description" i]'],
        label: /description/i
      },
      category: {
        selectors: ['select[name*="category" i]', '[role="combobox"][aria-label*="category" i]', 'button[aria-label*="category" i]'],
        label: /category/i
      },
      material: {
        selectors: [
          "#material-input",
          'input[aria-labelledby="material-label"]',
          'select[name*="material" i]',
          '[role="combobox"][aria-label*="material" i]',
          'button[aria-label*="material" i]',
          'input[name*="material" i]'
        ],
        valueContainerSelector: '[class*="_selectValue_"]',
        controlContainerSelector: '[class*="_selectControl_"]',
        selectedLabelSelector: '[class*="_selectedItemLabel_"]',
        removeButtonSelector: 'button[aria-label^="Remove "]',
        chipSelect: true,
        label: /material/i,
        optional: true
      },
      brand: {
        selectors: ['input[name*="brand" i]', 'input[id*="brand" i]', 'input[placeholder*="brand" i]', '[role="combobox"][aria-label*="brand" i]'],
        label: /brand/i
      },
      condition: {
        selectors: ['select[name*="condition" i]', '[role="combobox"][aria-label*="condition" i]', 'button[aria-label*="condition" i]'],
        label: /condition/i
      },
      colors: {
        label: /colou?rs?/i,
        multiple: true
      },
      packageSize: {
        selectors: ['select[name*="package" i]', '[role="combobox"][aria-label*="package" i]', 'button[aria-label*="package" i]', 'select[name*="shipping" i]'],
        label: /package size|parcel size|shipping size/i
      },
      price: {
        selectors: ['input[name*="price" i]', 'input[id*="price" i]', 'input[placeholder*="price" i]', 'input[inputmode="decimal"]'],
        label: /price/i
      }
    }
  };

  const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"], [role="textbox"], button';

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findControl(fieldConfig) {
    for (const selector of fieldConfig.selectors) {
      const element = document.querySelector(selector);
      if (element && !element.disabled && element.getAttribute("aria-disabled") !== "true") return element;
    }
    for (const label of document.querySelectorAll("label")) {
      if (!fieldConfig.label.test(cleanText(label.innerText || label.textContent))) continue;
      const associated = label.control || (label.htmlFor && document.getElementById(label.htmlFor));
      if (associated) return associated;
      const nested = label.querySelector(CONTROL_SELECTOR);
      if (nested) return nested;
      const nearby = (label.closest("fieldset") || label.parentElement)?.querySelector(CONTROL_SELECTOR);
      if (nearby) return nearby;
    }
    return null;
  }

  function fieldText(control) {
    if (control instanceof HTMLSelectElement) {
      return Array.from(control.selectedOptions, (option) => cleanText(option.textContent)).filter(Boolean);
    }
    if ("value" in control) return String(control.value || "").trim();
    return String(control.innerText || control.textContent || "").trim();
  }

  function readDropdown(name, control) {
    const config = CONFIG.fields[name];
    if (config.chipSelect) {
      const selectControl = control.closest(config.controlContainerSelector);
      const parent = selectControl || control.parentElement;
      const container = parent?.matches(config.valueContainerSelector)
        ? parent
        : parent?.querySelector(config.valueContainerSelector) ||
          control.parentElement?.closest(config.valueContainerSelector) ||
          control.parentElement;
      const chipLabels = Array.from(container?.querySelectorAll(config.selectedLabelSelector) || [])
        .map((item) => item.textContent.trim())
        .filter(Boolean);
      if (chipLabels.length) {
        const values = [...new Set(chipLabels)];
        console.info(`[SpeedyList] Scraped ${name} via selected chip labels:`, values);
        return config.multiple ? values : values[0];
      }

      const removeLabels = Array.from(container?.querySelectorAll(config.removeButtonSelector) || [])
        .map((button) => button.getAttribute("aria-label").replace(/^Remove\s+/, "").trim())
        .filter(Boolean);
      if (removeLabels.length) {
        const values = [...new Set(removeLabels)];
        console.info(`[SpeedyList] Scraped ${name} via remove-button labels:`, values);
        return config.multiple ? values : values[0];
      }

      console.warn(`[SpeedyList] No selected ${name} chips found; field container:`, container || parent || control);
      return config.multiple ? [] : "";
    }
    if (control instanceof HTMLSelectElement) {
      const selected = fieldText(control);
      return config.multiple ? selected : selected[0] || "";
    }
    let value = cleanText(control.getAttribute("aria-valuetext") || control.getAttribute("data-value") || fieldText(control));
    if (/^(select|choose|pick|add|search)\b/i.test(value)) value = "";
    return config.multiple ? (value ? value.split(/\s*,\s*/).filter(Boolean) : []) : value;
  }

  function readColors() {
    const control = document.querySelector("#colour-input");
    if (!control) {
      console.warn('[SpeedyList] Color input "#colour-input" not found; returning no colors.');
      return [];
    }

    const container = control.closest('[class*="_selectControl_"]');
    if (!container) {
      console.warn("[SpeedyList] Color select container not found for #colour-input; control:", control);
      return [];
    }

    const chipLabels = Array.from(container.querySelectorAll('[class*="_selectedItemLabel_"]'))
      .map((element) => element.textContent.trim())
      .filter(Boolean);
    if (chipLabels.length) {
      const colors = [...new Set(chipLabels)];
      console.info("[SpeedyList] Scraped colors via selected chip labels:", colors);
      return colors;
    }

    const removeLabels = Array.from(container.querySelectorAll('button[aria-label^="Remove "]'))
      .map((button) => button.getAttribute("aria-label").replace(/^Remove\s+/, "").trim())
      .filter(Boolean);
    if (removeLabels.length) {
      const colors = [...new Set(removeLabels)];
      console.info("[SpeedyList] Scraped colors via remove-button labels:", colors);
      return colors;
    }

    console.warn("[SpeedyList] No selected colors found; color container:", container);
    return [];
  }

  function normalizePrice(value) {
    let amount = String(value || "").trim().replace(/[^\d.,-]/g, "");
    if (!amount || !/\d/.test(amount)) return "";
    const comma = amount.lastIndexOf(",");
    const dot = amount.lastIndexOf(".");
    if (comma !== -1 && dot !== -1) {
      amount = comma > dot ? amount.replace(/\./g, "").replace(",", ".") : amount.replace(/,/g, "");
    } else if (comma !== -1) {
      amount = /,\d{1,2}$/.test(amount) ? amount.replace(",", ".") : amount.replace(/,/g, "");
    }
    return /^\d+(?:\.\d{1,2})?$/.test(amount) ? amount : "";
  }

  function logScraped(name, value, optional = false) {
    const missing = Array.isArray(value) ? value.length === 0 : !cleanText(value);
    if (missing) console.warn(`[SpeedyList] ${name} not set${optional ? " (optional; skipping)" : ""}.`);
    else console.info(`[SpeedyList] Scraped ${name}:`, value);
  }

  function scrapeListing() {
    const descriptionControl = findControl(CONFIG.fields.description);
    const rawDescription = descriptionControl
      ? String("value" in descriptionControl ? descriptionControl.value : descriptionControl.innerText || descriptionControl.textContent || "").trim()
      : "";
    const lines = rawDescription.split(/\r?\n/);
    const listing = { title: cleanText(lines.shift()), description: lines.join("\n").trim() };
    logScraped("title", listing.title);
    logScraped("description", listing.description);

    for (const [name, config] of Object.entries(CONFIG.fields)) {
      if (name === "description") continue;
      let value;
      if (name === "colors") {
        value = readColors();
      } else {
        const control = findControl(config);
        value = control ? readDropdown(name, control) : (config.multiple ? [] : "");
      }
      if (name === "price") value = normalizePrice(value);
      listing[name] = value;
      logScraped(name, value, config.optional);
    }
    return listing;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== CONFIG.messageType) return;
    const listing = scrapeListing();
    const warningCount = Object.entries(listing).filter(([name, value]) => {
      if (name === "material" && !value) return false;
      return Array.isArray(value) ? value.length === 0 : !cleanText(value);
    }).length;
    const payload = { version: 2, source: "depop", sourceUrl: location.href, createdAt: new Date().toISOString(), listing };

    chrome.storage.local.set({ [CONFIG.storageKey]: payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[SpeedyList] Could not save listing:", chrome.runtime.lastError.message);
        sendResponse({ ok: false, error: "Could not save listing data." });
        return;
      }
      console.info("[SpeedyList] Saved listing payload to chrome.storage.local.");
      sendResponse({ ok: true, warningCount });
    });
    return true;
  });
})();