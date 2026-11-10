(() => {
  "use strict";

  const CONFIG = {
    storageKey: "speedlist.pendingListing",
    payloadVersion: 2,
    formWaitMs: 12000,
    optionWaitMs: 2500,
    conditionMap: {
      "Excellent": "Very good", "Used - Excellent": "Very good", "Like new": "Very good",
      "Good": "Good", "Used - Good": "Good", "Fair": "Satisfactory", "Used - Fair": "Satisfactory",
      "New": "New without tags", "Brand new": "New without tags", "New without tags": "New without tags",
      "New with tags": "New with tags"
    },
    optionSelectors: ['[role="option"]', '[role="menuitem"]', '[role="checkbox"]', '[role="radio"]', '[role="listbox"] button', '[role="listbox"] li', '[role="dialog"] button'],
    fields: {
      title: { type: "text", selectors: ['input[name="title"]', 'input[id*="title" i]', 'input[placeholder*="title" i]', 'input[aria-label*="title" i]'], label: /\btitle\b/i },
      description: { type: "text", selectors: ['textarea[name*="description" i]', 'textarea[id*="description" i]', 'textarea[placeholder*="description" i]', 'textarea[aria-label*="description" i]'], label: /\bdescription\b/i },
      category: { type: "dropdown", selectors: ['select[name*="category" i]', '[role="combobox"][aria-label*="category" i]', 'button[aria-label*="category" i]'], label: /category/i },
      material: { type: "dropdown", optional: true, selectors: ['select[name*="material" i]', '[role="combobox"][aria-label*="material" i]', 'button[aria-label*="material" i]'], label: /material/i },
      brand: { type: "text", selectors: ['input[name*="brand" i]', 'input[id*="brand" i]', 'input[placeholder*="brand" i]', 'input[aria-label*="brand" i]'], label: /brand/i },
      condition: { type: "dropdown", selectors: ['select[name*="condition" i]', '[role="combobox"][aria-label*="condition" i]', 'button[aria-label*="condition" i]'], label: /condition/i },
      colors: { type: "dropdown", multiple: true, selectors: ['select[name*="color" i]', '[role="combobox"][aria-label*="color" i]', '[role="combobox"][aria-label*="colour" i]', 'button[aria-label*="color" i]', 'button[aria-label*="colour" i]'], label: /colou?rs?/i },
      packageSize: { type: "dropdown", selectors: ['select[name*="package" i]', '[role="combobox"][aria-label*="package" i]', 'button[aria-label*="package" i]', 'select[name*="shipping" i]'], label: /package size|parcel size|shipping size/i },
      price: { type: "text", selectors: ['input[name*="price" i]', 'input[id*="price" i]', 'input[placeholder*="price" i]', 'input[inputmode="decimal"]'], label: /price/i }
    }
  };

  const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"], [role="textbox"], button';
  let filling = false;
  let activePayload = null;

  const retryButton = document.createElement("button");
  retryButton.id = "speedlist-retry-empty-fields";
  retryButton.type = "button";
  retryButton.textContent = "Retry empty fields";
  retryButton.disabled = true;
  retryButton.setAttribute("aria-label", "Try filling empty listing fields again");
  retryButton.style.cssText = [
    "position:fixed",
    "top:16px",
    "right:16px",
    "z-index:2147483647",
    "min-height:38px",
    "padding:0 14px",
    "border:1px solid #0f5745",
    "border-radius:5px",
    "background:#176b57",
    "box-shadow:0 3px 12px rgba(0,0,0,.2)",
    "color:#fff",
    "font:600 13px/1.2 system-ui,sans-serif",
    "cursor:pointer"
  ].join(";");
  document.body.append(retryButton);

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    return Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  }

  function usable(element) {
    if (!element || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && (element.readOnly || element.type === "hidden")) return false;
    return element.matches(CONTROL_SELECTOR);
  }

  function findControl(config) {
    for (const selector of config.selectors) {
      for (const element of document.querySelectorAll(selector)) if (usable(element) && visible(element)) return element;
    }
    for (const label of document.querySelectorAll("label")) {
      if (!config.label.test(cleanText(label.innerText || label.textContent))) continue;
      const associated = label.control || (label.htmlFor && document.getElementById(label.htmlFor));
      if (usable(associated) && visible(associated)) return associated;
      const nested = label.querySelector(CONTROL_SELECTOR);
      if (usable(nested) && visible(nested)) return nested;
      const nearby = (label.closest("fieldset") || label.parentElement)?.querySelector(CONTROL_SELECTOR);
      if (usable(nearby) && visible(nearby)) return nearby;
    }
    return null;
  }

  function findFields() {
    return Object.fromEntries(Object.entries(CONFIG.fields).map(([name, config]) => [name, findControl(config)]));
  }

  function waitForFields() {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const fields = findFields();
        if (Object.entries(CONFIG.fields).every(([name, config]) => config.optional || fields[name])) {
          clearTimeout(timeoutId);
          observer?.disconnect();
          resolve(fields);
          return true;
        }
        return false;
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timeoutId = setTimeout(() => { observer.disconnect(); resolve(findFields()); }, CONFIG.formWaitMs);
    });
  }

  function showStatus(message, isError = false) {
    let status = document.getElementById("speedlist-vinted-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "speedlist-vinted-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:10px 14px;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.18);font:500 13px/1.4 system-ui,sans-serif";
      document.body.append(status);
    }
    status.textContent = message;
    status.style.backgroundColor = isError ? "#9b3d34" : "#176b57";
    status.style.color = "#fff";
  }

  function setTextValue(element, value) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) return false;
      setter.call(element, value);
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else return false;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return ("value" in element ? element.value : element.textContent) === value;
  }

  function mapCondition(value) {
    const key = Object.keys(CONFIG.conditionMap).find((candidate) => candidate.toLowerCase() === value.toLowerCase());
    if (key) return CONFIG.conditionMap[key];
    console.warn(`[SpeedyList] No condition mapping for "${value}"; trying the Depop text unchanged.`);
    return value;
  }

  function optionText(option) {
    return cleanText(option.innerText || option.textContent || option.getAttribute("aria-label"));
  }

  function matchOption(options, requested, checkVisibility = true) {
    const target = cleanText(requested);
    const candidates = options.filter((option) => (!checkVisibility || visible(option)) && optionText(option));
    return candidates.find((option) => optionText(option) === target) ||
      candidates.find((option) => optionText(option).toLowerCase().includes(target.toLowerCase())) || null;
  }

  function pageOptions(control) {
    const options = new Set();
    for (const selector of CONFIG.optionSelectors) {
      for (const option of document.querySelectorAll(selector)) if (option !== control && !control.contains(option)) options.add(option);
    }
    return [...options];
  }

  function waitForOption(control, requested) {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const option = matchOption(pageOptions(control), requested);
        if (option) {
          clearTimeout(timeoutId);
          observer?.disconnect();
          resolve(option);
          return true;
        }
        return false;
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      timeoutId = setTimeout(() => { observer.disconnect(); resolve(matchOption(pageOptions(control), requested)); }, CONFIG.optionWaitMs);
    });
  }

  function fireSelectEvents(control) {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillNativeSelect(control, values, fieldName) {
    const selected = [];
    const missing = [];
    for (const value of values) {
      const option = matchOption(Array.from(control.options), value, false);
      if (!option) { missing.push(value); continue; }
      option.click();
      option.selected = true;
      selected.push(optionText(option));
      if (!control.multiple) break;
    }
    if (selected.length) {
      control.focus();
      control.click();
      fireSelectEvents(control);
    }
    if (missing.length || !selected.length) {
      console.warn(`[SpeedyList] Could not match ${fieldName} option(s):`, missing.length ? missing : values);
      return false;
    }
    console.info(`[SpeedyList] Filled ${fieldName}:`, selected);
    return true;
  }

  async function fillCustomDropdown(control, values, fieldName) {
    const selected = [];
    for (const value of values) {
      let option = matchOption(pageOptions(control), value);
      if (!option) {
        control.scrollIntoView({ behavior: "smooth", block: "center" });
        control.click();
        option = await waitForOption(control, value);
      }
      if (!option) {
        console.warn(`[SpeedyList] Could not match ${fieldName} option "${value}".`);
        return false;
      }
      const alreadySelected = option.getAttribute("aria-selected") === "true" || option.getAttribute("aria-checked") === "true" || option.getAttribute("data-state") === "checked";
      if (!alreadySelected) option.click();
      selected.push(optionText(option));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    console.info(`[SpeedyList] Filled ${fieldName}:`, selected);
    return true;
  }

  async function fillDropdown(control, config, value, name) {
    const values = config.multiple ? value : [value];
    return control instanceof HTMLSelectElement
      ? fillNativeSelect(control, values, name)
      : fillCustomDropdown(control, values, name);
  }

  function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(cleanText(value));
  }

  function fieldHasValue(control, fieldName) {
    if (control instanceof HTMLSelectElement) {
      return Array.from(control.selectedOptions).some((option) => {
        const value = cleanText(option.value || option.textContent);
        return value && !/^(select|choose|pick|add|search)(\b|\s)/i.test(value);
      });
    }
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      return Boolean(cleanText(control.value));
    }
    if (control.isContentEditable) {
      return Boolean(cleanText(control.textContent));
    }

    const accessibleValue = cleanText(control.getAttribute("aria-valuetext") || control.getAttribute("data-value"));
    if (accessibleValue && !/^(select|choose|pick|add|search)(\b|\s)/i.test(accessibleValue)) {
      return true;
    }

    const container = control.closest('[class*="_selectControl_"], fieldset, [role="group"]') || control.parentElement;
    const selectedChips = container?.querySelector('[class*="_selectedItemLabel_"]');
    if (selectedChips && cleanText(selectedChips.textContent)) {
      return true;
    }

    const displayedValue = cleanText(control.innerText || control.textContent);
    const placeholders = {
      category: "category",
      material: "material",
      condition: "condition",
      colors: "color",
      packageSize: "package size"
    };
    return Boolean(displayedValue &&
      displayedValue.toLowerCase() !== placeholders[fieldName] &&
      !/^(select|choose|pick|add|search)(\b|\s)/i.test(displayedValue));
  }

  function updateRetryButton(isBusy = false) {
    retryButton.disabled = isBusy || !activePayload;
    retryButton.textContent = isBusy ? "Retrying..." : "Retry empty fields";
  }

  function clearPayload() {
    chrome.storage.local.remove(CONFIG.storageKey, () => {
      if (chrome.runtime.lastError) {
        console.warn("[SpeedyList] Fields filled, but storage cleanup failed:", chrome.runtime.lastError.message);
        showStatus("Fields filled, but the saved copy could not be cleared.", true);
        return;
      }
      console.info("[SpeedyList] Cleared the saved listing payload.");
      showStatus("Listing details filled. Review them before submitting.");
    });
  }

  async function fillListing(payload, retry = false) {
    if (filling) return;
    filling = true;
    updateRetryButton(true);
    showStatus("Looking for Vinted listing fields...");
    const controls = await waitForFields();
    let failed = false;
    for (const [name, config] of Object.entries(CONFIG.fields)) {
      let value = payload.listing[name];
      if (!hasValue(value)) {
        console.warn(`[SpeedyList] No source value for ${name}${config.optional ? " (optional; skipping)" : "; keeping payload for retry"}.`);
        if (!config.optional) failed = true;
        continue;
      }
      const control = controls[name];
      if (!control) {
        console.warn(`[SpeedyList] Could not find the Vinted ${name} field.`);
        if (!config.optional) failed = true;
        continue;
      }
      if (retry && fieldHasValue(control, name)) {
        console.info(`[SpeedyList] Retry skipped populated ${name} field.`);
        continue;
      }
      if (name === "condition") value = mapCondition(String(value));
      const success = config.type === "dropdown"
        ? await fillDropdown(control, config, value, name)
        : setTextValue(control, String(value));
      if (success) {
        if (config.type !== "dropdown") console.info(`[SpeedyList] Filled ${name}:`, value);
      } else {
        console.warn(`[SpeedyList] Could not fill Vinted ${name}.`);
        failed = true;
      }
    }
    filling = false;
    updateRetryButton();
    if (failed) {
      console.warn("[SpeedyList] Required fields remain unmatched; payload retained in storage.");
      showStatus("Some fields need attention. The saved copy is still available.", true);
      return;
    }
    clearPayload();
  }

  chrome.storage.local.get(CONFIG.storageKey, (result) => {
    if (chrome.runtime.lastError) {
      console.warn("[SpeedyList] Could not read saved listing:", chrome.runtime.lastError.message);
      showStatus("Could not read the saved listing.", true);
      return;
    }
    const payload = result[CONFIG.storageKey];
    if (!payload) return;
    if (payload.version !== CONFIG.payloadVersion || payload.source !== "depop" || !payload.listing) {
      console.warn("[SpeedyList] Saved listing payload is invalid or has an unsupported version.");
      showStatus("Saved listing data is invalid and was left in storage.", true);
      return;
    }

    activePayload = payload;
    updateRetryButton();
    if (payload.vintedAutoAttempted) {
      console.info("[SpeedyList] Automatic fill already attempted; use the retry button when more fields are ready.");
      showStatus("Choose the listing category, then retry empty fields if needed.");
      return;
    }

    activePayload = { ...payload, vintedAutoAttempted: true };
    chrome.storage.local.set({ [CONFIG.storageKey]: activePayload }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[SpeedyList] Could not mark the automatic fill attempt:", chrome.runtime.lastError.message);
      }
      fillListing(activePayload);
    });
  });

  retryButton.addEventListener("click", () => {
    if (!activePayload) {
      showStatus("No saved listing is available to retry.", true);
      return;
    }
    fillListing(activePayload, true);
  });
})();