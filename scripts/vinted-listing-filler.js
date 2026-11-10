(() => {
  "use strict";

  const CONFIG = {
    storageKey: "speedlist.pendingListing",
    payloadVersion: 3,
    modalWaitMs: 3000,
    searchSettleMs: 500,
    stepWaitMs: 300,
    selectionWaitMs: 15000,
    selectionSettleMs: 900,
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
      category: { type: "dropdown", testIdPrefixes: ["category"], selectors: ['button[data-testid="category-select-dropdown-input"]', 'select[name*="category" i]', '[role="combobox"][aria-label*="category" i]', 'button[aria-label*="category" i]'], label: /category/i },
      brand: { type: "dropdown", testIdPrefixes: ["brand"], selectors: ['button[data-testid="brand-select-dropdown-input"]', 'select[name*="brand" i]', '[role="combobox"][aria-label*="brand" i]', 'button[aria-label*="brand" i]'], label: /brand/i },
      size: { type: "dropdown", optional: true, testIdPrefixes: ["size"], selectors: ['button[data-testid="size-select-dropdown-input"]', 'select[name="size" i]', '[role="combobox"][aria-label="size" i]'], label: /^(clothing )?size$/i },
      condition: { type: "dropdown", testIdPrefixes: ["condition"], selectors: ['button[data-testid="condition-select-dropdown-input"]', 'select[name*="condition" i]', '[role="combobox"][aria-label*="condition" i]', 'button[aria-label*="condition" i]'], label: /condition/i },
      colors: { type: "dropdown", multiple: true, testIdPrefixes: ["color", "colour"], selectors: ['button[data-testid="color-select-dropdown-input"]', 'button[data-testid="colour-select-dropdown-input"]', 'select[name*="color" i]', '[role="combobox"][aria-label*="color" i]', '[role="combobox"][aria-label*="colour" i]'], label: /colou?rs?/i },
      material: { type: "dropdown", optional: true, testIdPrefixes: ["material"], selectors: ['button[data-testid="material-select-dropdown-input"]', 'select[name*="material" i]', '[role="combobox"][aria-label*="material" i]', 'button[aria-label*="material" i]'], label: /material/i },
      packageSize: { type: "dropdown", testIdPrefixes: ["package-size", "packageSize", "shipping-size"], selectors: ['button[data-testid="package-size-select-dropdown-input"]', 'select[name*="package" i]', '[role="combobox"][aria-label*="package" i]', 'button[aria-label*="package" i]', 'select[name*="shipping" i]'], label: /package size|parcel size|shipping size/i },
      price: { type: "text", selectors: ['input[name*="price" i]', 'input[id*="price" i]', 'input[placeholder*="price" i]', 'input[inputmode="decimal"]'], label: /price/i }
    },
    fillOrder: ["title", "description", "category", "brand", "size", "condition", "colors", "material", "price", "packageSize"]
  };

  const CONTROL_SELECTOR = 'input, textarea, select, [role="combobox"], [contenteditable="true"], [role="textbox"], button';
  let filling = false;
  let activePayload = null;
  let dropdownWaitTimedOut = false;

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

  function fieldPrefixes(config) {
    return config.testIdPrefixes || [];
  }

  function findFieldControl(name, config, reportMismatch = false) {
    const prefixes = fieldPrefixes(config);
    for (const prefix of prefixes) {
      const trigger = document.querySelector(`button[data-testid="${prefix}-select-dropdown-input"]`);
      if (trigger) return trigger;
    }

    const fallback = findControl(config);
    if (fallback) {
      if (reportMismatch) {
        console.warn(`[SpeedyList] ${name} trigger did not match configured test IDs; paste this markup to update the config:`, fallback.outerHTML);
      }
      return fallback;
    }
    if (reportMismatch) {
      console.warn(`[SpeedyList] Could not find the ${name} trigger. Expected test IDs:`, prefixes);
    }
    return null;
  }

  function waitForFieldControl(name, config, timeoutMs = CONFIG.modalWaitMs) {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const control = findFieldControl(name, config);
        if (control) {
          clearTimeout(timeoutId);
          observer?.disconnect();
          resolve(control);
          return true;
        }
        return false;
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(findFieldControl(name, config));
      }, timeoutMs);
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

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function dispatchPointerClick(element) {
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1
    });
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1 });
    const pointerUp = new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 0
    });
    const mouseUp = new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 });
    const click = new MouseEvent("click", { bubbles: true, button: 0, buttons: 0 });
    for (const event of [pointerDown, mouseDown, pointerUp, mouseUp, click]) {
      element.dispatchEvent(event);
    }
  }

  function dropdownTestId(prefix, suffix) {
    return `[data-testid="${prefix}-select-dropdown-${suffix}"]`;
  }

  function findDropdownContent(prefixes) {
    for (const prefix of prefixes) {
      const content = document.querySelector(dropdownTestId(prefix, "content"));
      if (content) return { prefix, content };
    }
    return null;
  }

  function waitForDropdownContent(prefixes) {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const result = findDropdownContent(prefixes);
        if (result) {
          clearTimeout(timeoutId);
          observer?.disconnect();
          resolve(result);
          return true;
        }
        return false;
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true });
      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(findDropdownContent(prefixes));
      }, CONFIG.modalWaitMs);
    });
  }

  function findModalSearchInput(content, prefix) {
    return content.querySelector(`input[data-testid="${prefix}-search--input"]`);
  }

  function setSearchValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    return true;
  }

  function visibleDropdownOptions(content) {
    return Array.from(content.querySelectorAll('[role="radio"], [role="checkbox"]'))
      .filter(visible);
  }

  function optionLabel(option) {
    return cleanText(option.getAttribute("aria-label"));
  }

  function matchDropdownOption(options, requested) {
    const target = cleanText(requested);
    const labels = options.map((option) => ({ option, label: optionLabel(option) })).filter(({ label }) => label);
    return labels.find(({ label }) => label === target)?.option ||
      labels.find(({ label }) => label.toLowerCase() === target.toLowerCase())?.option ||
      labels.find(({ label }) => label.toLowerCase().includes(target.toLowerCase()))?.option ||
      null;
  }

  function logVisibleOptions(content, name) {
    const labels = visibleDropdownOptions(content).map((option) =>
      optionLabel(option) || cleanText(option.querySelector(".web_ui__Cell__title")?.textContent)
    ).filter(Boolean);
    console.warn(`[SpeedyList] Visible ${name} options:`, labels);
  }

  function findDropdownCloseButton(content, prefixes) {
    for (const prefix of prefixes) {
      const selector = dropdownTestId(prefix, "close-button");
      const closeButton = content.querySelector(selector) || document.querySelector(selector);
      if (closeButton) return closeButton;
    }
    return null;
  }

  function closeDropdown(content, prefixes) {
    if (!content?.isConnected) return;
    const closeButton = findDropdownCloseButton(content, prefixes);
    if (closeButton) {
      dispatchPointerClick(closeButton);
    } else {
      console.warn("[SpeedyList] Dropdown close button not found; modal content:", content);
    }
  }

  function verifyDropdownValue(prefixes, requestedValues, name) {
    for (const prefix of prefixes) {
      const valueElement = document.querySelector(`[data-testid="${prefix}-select-dropdown-input--value"]`);
      if (!valueElement) continue;
      const displayed = cleanText(valueElement.textContent);
      const missing = requestedValues.filter((requested) =>
        !displayed.toLowerCase().includes(cleanText(requested).toLowerCase())
      );
      if (missing.length) {
        console.warn(`[SpeedyList] ${name} selection did not verify; expected ${missing.join(", ")}, displayed:`, displayed);
        return false;
      }
      console.info(`[SpeedyList] Verified ${name}:`, displayed);
      return true;
    }
    console.warn(`[SpeedyList] Could not verify ${name}; value span not found for test IDs:`, prefixes);
    return false;
  }

  function dropdownValueContains(prefixes, requested) {
    return prefixes.some((prefix) => {
      const valueElement = document.querySelector(`[data-testid="${prefix}-select-dropdown-input--value"]`);
      return cleanText(valueElement?.textContent).toLowerCase().includes(cleanText(requested).toLowerCase());
    });
  }

  function optionIsSelected(option, prefixes, requested) {
    return option.getAttribute("aria-checked") === "true" ||
      option.getAttribute("aria-selected") === "true" ||
      dropdownValueContains(prefixes, requested);
  }

  function modalIsLoading(content) {
    if (!content?.isConnected) return false;
    const indicators = content.querySelectorAll('[aria-busy="true"], [data-testid*="loading" i], [class*="loading" i], [class*="spinner" i], [role="status"]');
    return Array.from(indicators).some((indicator) => {
      if (!visible(indicator)) return false;
      const state = `${indicator.getAttribute("aria-label") || ""} ${indicator.textContent || ""}`;
      return indicator.getAttribute("aria-busy") === "true" || /loading/i.test(state) ||
        indicator.matches('[data-testid*="loading" i], [class*="loading" i], [class*="spinner" i]');
    });
  }

  async function waitForDropdownSelection(option, prefixes, requested, content) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < CONFIG.selectionWaitMs) {
      if (optionIsSelected(option, prefixes, requested)) return "selected";
      const elapsed = Date.now() - startedAt;
        if (content?.isConnected && !modalIsLoading(content) && elapsed >= CONFIG.selectionSettleMs) return "not-selected";
      await wait(100);
    }
    return optionIsSelected(option, prefixes, requested) ? "selected" : "timeout";
  }

  function fireSelectEvents(control) {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillNativeSelect(control, values, fieldName) {
    const selected = [];
    const missing = [];
    for (const value of values) {
      const options = Array.from(control.options).map((option) => ({ option, label: optionText(option) }));
      const target = cleanText(value);
      const option = options.find(({ label }) => label === target)?.option ||
        options.find(({ label }) => label.toLowerCase() === target.toLowerCase())?.option ||
        options.find(({ label }) => label.toLowerCase().includes(target.toLowerCase()))?.option;
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

  async function fillCustomDropdown(control, config, values, fieldName) {
    const prefixes = fieldPrefixes(config);
    if (!prefixes.length) {
      console.warn(`[SpeedyList] No dropdown test-id prefix configured for ${fieldName}; trigger:`, control.outerHTML);
      return false;
    }

    const expectedTestIds = prefixes.map((prefix) => `${prefix}-select-dropdown-input`);
    if (!expectedTestIds.includes(control.getAttribute("data-testid"))) {
      console.warn(`[SpeedyList] ${fieldName} trigger has an unexpected test ID; paste this markup to update the config:`, control.outerHTML);
    }

    const selected = [];
    let modalResult = null;
    let failed = false;
    let nonBlockingOther = false;

    try {
      control.scrollIntoView({ behavior: "smooth", block: "center" });
      dispatchPointerClick(control);
      modalResult = await waitForDropdownContent(prefixes);
      if (!modalResult) {
        console.warn(`[SpeedyList] ${fieldName} dialog did not appear; trigger:`, control.outerHTML);
        return false;
      }

      for (const value of values) {
        if (!modalResult.content.isConnected) {
          control = findFieldControl(fieldName, config, true) || control;
          dispatchPointerClick(control);
          modalResult = await waitForDropdownContent(prefixes);
        }
        if (!modalResult?.content) {
          console.warn(`[SpeedyList] ${fieldName} dialog closed before all values were selected.`);
          failed = true;
          break;
        }

        const searchInput = findModalSearchInput(modalResult.content, modalResult.prefix);
        if (searchInput && setSearchValue(searchInput, cleanText(value))) {
          await wait(CONFIG.searchSettleMs);
        }

        const options = visibleDropdownOptions(modalResult.content);
        const option = matchDropdownOption(options, value);
        if (!option) {
          logVisibleOptions(modalResult.content, fieldName);
          if (fieldName === "brand" && cleanText(value).toLowerCase() === "other") {
            console.warn('[SpeedyList] Depop brand is "Other" and Vinted has no matching option; leaving Brand empty.');
            nonBlockingOther = true;
          } else {
            console.warn(`[SpeedyList] Could not match ${fieldName} option "${value}".`);
            failed = true;
          }
          break;
        }

        if (!optionIsSelected(option, prefixes, value)) {
          showStatus(`Waiting for Vinted to select ${fieldName}...`);
          dispatchPointerClick(option);
          let selectionState = await waitForDropdownSelection(option, prefixes, value, modalResult.content);
          if (selectionState === "timeout") {
            dropdownWaitTimedOut = true;
            console.warn(`[SpeedyList] Vinted is still loading ${fieldName} option "${value}"; pausing the remaining fields.`);
            failed = true;
            break;
          }
          if (selectionState === "not-selected" && option.isConnected) {
            console.warn(`[SpeedyList] Pointer sequence did not select ${fieldName} option "${value}"; trying element click fallback.`);
            option.click();
            selectionState = await waitForDropdownSelection(option, prefixes, value, modalResult.content);
            if (selectionState === "timeout") {
              dropdownWaitTimedOut = true;
              console.warn(`[SpeedyList] Vinted is still loading ${fieldName} option "${value}" after fallback; pausing the remaining fields.`);
              failed = true;
              break;
            }
          }
        }
        if (!optionIsSelected(option, prefixes, value)) {
          console.warn(`[SpeedyList] Click did not select ${fieldName} option "${value}".`);
          failed = true;
          break;
        }
        selected.push(optionLabel(option));
        await wait(CONFIG.stepWaitMs);
      }
    } finally {
      closeDropdown(modalResult?.content, prefixes);
    }

    if (nonBlockingOther) return true;
    if (failed || !selected.length) return false;
    const verified = verifyDropdownValue(prefixes, selected, fieldName);
    if (verified) console.info(`[SpeedyList] Filled ${fieldName}:`, selected);
    return verified;
  }

  async function fillDropdown(control, config, value, name) {
    const values = config.multiple ? value : [value];
    return control instanceof HTMLSelectElement
      ? fillNativeSelect(control, values, name)
      : fillCustomDropdown(control, config, values, name);
  }

  function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(cleanText(value));
  }

  function fieldHasValue(control, fieldName, config) {
    for (const prefix of fieldPrefixes(config)) {
      const valueElement = document.querySelector(`[data-testid="${prefix}-select-dropdown-input--value"]`);
      const displayed = cleanText(valueElement?.textContent);
      if (displayed && !/^(select|choose|pick|add|search)(\b|\s)/i.test(displayed)) {
        return true;
      }
    }

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
    dropdownWaitTimedOut = false;
    updateRetryButton(true);
    showStatus("Looking for Vinted listing fields...");
    let failed = false;
    for (const name of CONFIG.fillOrder) {
      const config = CONFIG.fields[name];
      let value = payload.listing[name];
      if (!hasValue(value)) {
        console.warn(`[SpeedyList] No source value for ${name}${config.optional ? " (optional; skipping)" : "; keeping payload for retry"}.`);
        if (!config.optional) failed = true;
        await wait(CONFIG.stepWaitMs);
        continue;
      }
      const control = await waitForFieldControl(name, config);
      if (!control) {
        findFieldControl(name, config, true);
        console.warn(`[SpeedyList] Could not find the Vinted ${name} field.`);
        if (!config.optional) failed = true;
        await wait(CONFIG.stepWaitMs);
        continue;
      }
      if (retry && fieldHasValue(control, name, config)) {
        console.info(`[SpeedyList] Retry skipped populated ${name} field.`);
        await wait(CONFIG.stepWaitMs);
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
        if (dropdownWaitTimedOut) break;
      }
      await wait(CONFIG.stepWaitMs);
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