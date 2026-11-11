(() => {
  "use strict";

  const CONFIG = {
    storageKey: "speedlist.pendingListing",
    payloadVersion: 3,
    modalWaitMs: 3000,
    fieldWaitMs: 5000,
    searchSettleMs: 500,
    stepWaitMs: 300,
    manualSelectionWaitMs: 120000,
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
      title: { type: "text", selectors: ['input[name="title"]', 'input[id*="title" i]', 'input[placeholder*="title" i]', 'input[aria-label*="title" i]'], label: /\btitle\b/i },
      description: { type: "text", selectors: ['textarea[name*="description" i]', 'textarea[id*="description" i]', 'textarea[placeholder*="description" i]', 'textarea[aria-label*="description" i]'], label: /\bdescription\b/i },
      category: {
        type: "dropdown",
        mode: "manualCategory",
        drilldown: true,
        triggerTestId: "catalog-select-dropdown-input",
        triggerAliases: ["category-select-dropdown-input"],
        contentTestId: "catalog-select-dropdown-content",
        contentAliases: ["category-select-dropdown-content"],
        valueTestId: "catalog-select-dropdown-input--value",
        closeTestId: "catalog-select-dropdown-close-button"
      },
      brand: {
        type: "dropdown",
        mode: "manualSearch",
        triggerTestId: "brand-select-dropdown-input",
        contentTestId: "brand-select-dropdown-content",
        searchTestId: "brand-search--input",
        closeTestId: "brand-select-dropdown-close-button",
        valueTestId: "brand-select-dropdown-input--value",
        selectedValueSelectors: ['input[name="brand"]']
      },
      size: {
        type: "dropdown",
        mode: "autoSingle",
        optional: true,
        triggerTestId: "category-size-single-grid-input",
        contentTestId: "category-size-single-grid-content",
        valueTestId: "category-size-single-grid-input--value",
        closeTestId: "category-size-single-grid-close-button"
      },
      condition: {
        type: "dropdown",
        mode: "autoSingle",
        triggerTestId: "category-condition-single-list-input",
        contentTestId: "category-condition-single-list-content",
        valueTestId: "category-condition-single-list-input--value",
        closeTestId: "category-condition-single-list-close-button"
      },
      colors: {
        type: "dropdown",
        mode: "autoMulti",
        multiple: true,
        maxSelections: 2,
        triggerTestId: "color-select-dropdown-input",
        contentTestId: "color-select-dropdown-content",
        valueTestId: "color-select-dropdown-input--value",
        closeTestId: "color-select-dropdown-close-button"
      },
      material: {
        type: "dropdown",
        mode: "autoMulti",
        multiple: true,
        optional: true,
        triggerTestId: "category-material-multi-list-input",
        contentTestId: "category-material-multi-list-content",
        valueTestId: "category-material-multi-list-input--value",
        closeTestId: "category-material-multi-list-close-button"
      },
      price: {
        type: "text",
        selectors: ['input[data-testid="price-input--input"]'],
        label: /price/i
      },
      packageSize: {
        type: "package",
        mode: "packageRadio",
        options: [
          { label: "Small", titleTestId: "1-package-size--cell--title", inputTestId: "package_type_selector_1--input" },
          { label: "Medium", titleTestId: "2-package-size--cell--title", inputTestId: "package_type_selector_2--input" },
          { label: "Large", titleTestId: "3-package-size--cell--title", inputTestId: "package_type_selector_3--input" }
        ]
      }
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

  function fieldTriggerTestIds(config) {
    return [config.triggerTestId, ...(config.triggerAliases || [])].filter(Boolean);
  }

  function findFieldControl(name, config, reportMismatch = false) {
    if (config.type === "dropdown") {
      for (const testId of fieldTriggerTestIds(config)) {
        const trigger = document.querySelector(`[data-testid="${testId}"]`);
        if (trigger) return trigger;
      }
      if (reportMismatch) {
        console.warn(`[SpeedyList] Could not find the ${name} dropdown by its configured test IDs:`, fieldTriggerTestIds(config));
      }
      return null;
    }

    if (config.type === "package") {
      for (const option of config.options) {
        const input = document.querySelector(`[data-testid="${option.inputTestId}"]`);
        const title = document.querySelector(`[data-testid="${option.titleTestId}"]`);
        if (input || title) return input || title;
      }
      if (reportMismatch) console.warn("[SpeedyList] Could not find the configured Package size radios.", config.options);
      return null;
    }

    return findControl(config);
  }

  function waitForFieldControl(name, config, timeoutMs = CONFIG.fieldWaitMs) {
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

  function findDropdownContent(config) {
    const contentTestIds = [config.contentTestId, ...(config.contentAliases || [])].filter(Boolean);
    for (const testId of contentTestIds) {
      const content = document.querySelector(`[data-testid="${testId}"]`);
      if (content) return { content, testId, fallback: false };
    }
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]')).find(visible);
    return dialog ? { content: dialog, testId: null, fallback: true } : null;
  }

  function waitForDropdownContent(config) {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const result = findDropdownContent(config);
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
        resolve(findDropdownContent(config));
      }, CONFIG.modalWaitMs);
    });
  }

  function findModalSearchInput(content, config) {
    return config.searchTestId ? content.querySelector(`input[data-testid="${config.searchTestId}"]`) : null;
  }

  function waitForModalSearchInput(content, config) {
    return new Promise((resolve) => {
      let observer;
      let timeoutId;
      const check = () => {
        const input = findModalSearchInput(content, config);
        if (input) {
          clearTimeout(timeoutId);
          observer?.disconnect();
          resolve(input);
          return true;
        }
        return false;
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(content, { childList: true, subtree: true });
      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(findModalSearchInput(content, config));
      }, CONFIG.fieldWaitMs);
    });
  }

  function setSearchValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    const query = cleanText(value);
    input.focus();
    setter.call(input, query);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: query
    }));
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  function visibleDropdownOptions(content) {
    return Array.from(content.querySelectorAll('[role="radio"], [role="checkbox"]'))
      .filter(visible);
  }

  function categoryPath(value) {
    const entries = Array.isArray(value) ? value : [value];
    return entries.flatMap((entry) => String(entry || "").split(/\s*(?:>|›|\/|\|)\s*/))
      .map(cleanText)
      .filter(Boolean);
  }

  function optionLabel(option) {
    return cleanText(
      option.getAttribute("aria-label") ||
      option.querySelector(".web_ui__Cell__title")?.textContent ||
      option.innerText ||
      option.textContent
    );
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
    console.warn(`[SpeedyList] ${name} dialog markup (first 3000 characters):`, content.outerHTML.slice(0, 3000));
  }

  function findDropdownCloseButton(content, config) {
    const closeTestId = config.closeTestId || config.triggerTestId?.replace(/-input$/, "-close-button");
    if (closeTestId) {
      const selector = `[data-testid="${closeTestId}"]`;
      const closeButton = content.querySelector(selector) || document.querySelector(selector);
      if (closeButton) return closeButton;
    }
    return null;
  }

  function closeDropdown(content, config) {
    if (!content?.isConnected) return;
    const closeButton = findDropdownCloseButton(content, config);
    if (closeButton) {
      dispatchPointerClick(closeButton);
    } else {
      console.warn("[SpeedyList] Dropdown close button not found; modal content:", content);
    }
  }

  function fieldValue(config) {
    const values = [];
    for (const testId of config.valueTestIds || (config.valueTestId ? [config.valueTestId] : [])) {
      const value = cleanText(document.querySelector(`[data-testid="${testId}"]`)?.textContent);
      if (value) values.push(value);
    }
    for (const selector of config.selectedValueSelectors || []) {
      const element = document.querySelector(selector);
      const value = cleanText(element && "value" in element ? element.value : element?.textContent);
      if (value) values.push(value);
    }
    return [...new Set(values)].join(" | ");
  }

  function verifyDropdownValue(config, requestedValues, name) {
    const displayed = fieldValue(config);
    const missing = requestedValues.filter((requested) =>
      !displayed.toLowerCase().includes(cleanText(requested).toLowerCase())
    );
    if (missing.length) {
      console.warn(`[SpeedyList] ${name} selection did not verify; expected ${missing.join(", ")}, displayed:`, displayed);
      return false;
    }
    console.info(`[SpeedyList] Verified ${name}:`, displayed);
    return Boolean(displayed);
  }

  function dropdownValueContains(config, requested) {
    return fieldValue(config).toLowerCase().includes(cleanText(requested).toLowerCase());
  }

  function optionIsSelected(option, config, requested) {
    return option.getAttribute("aria-checked") === "true" ||
      option.getAttribute("aria-selected") === "true" ||
      dropdownValueContains(config, requested);
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

  function dropdownDisplayedValue(config) {
    return fieldValue(config);
  }

  function hasAssignedDropdownValue(value) {
    return Boolean(value && !/^(select|choose|pick|add|search)(\b|\s)/i.test(value));
  }

  async function waitForManualSelection(config, requested, initialValue, content) {
    let clickedLabel = "";
    const handleOptionClick = (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
      const activeContent = findDropdownContent(config)?.content || content;
      const eventTarget = event.target instanceof Element ? event.target : null;
      const option = path.find((node) => node instanceof Element && node.matches('[role="radio"], [role="checkbox"]')) ||
        eventTarget?.closest('[role="radio"], [role="checkbox"]');
      const dialog = option?.closest('[role="dialog"]') || activeContent?.closest('[role="dialog"]');
      if (!option || (!activeContent?.contains(option) && !dialog?.contains(option))) return;
      clickedLabel = optionLabel(option) || cleanText(option.querySelector(".web_ui__Cell__title")?.textContent);
      console.info("[SpeedyList] Detected manual dropdown option click:", clickedLabel);
    };
    document.addEventListener("click", handleOptionClick, true);

    const deadline = Date.now() + CONFIG.manualSelectionWaitMs;
    try {
      while (Date.now() < deadline) {
        const displayed = dropdownDisplayedValue(config);
        const requestedText = cleanText(requested).toLowerCase();
        const displayedLower = displayed.toLowerCase();
        if (displayedLower && (displayedLower.includes(requestedText) || requestedText.includes(displayedLower))) {
          return displayed;
        }

        const activeContent = findDropdownContent(config)?.content || content;
        const matchingOption = matchDropdownOption(visibleDropdownOptions(activeContent), requested);
        if (matchingOption && (
          matchingOption.getAttribute("aria-checked") === "true" ||
          matchingOption.getAttribute("aria-selected") === "true"
        )) {
          return optionLabel(matchingOption) || displayed || cleanText(requested);
        }

        if (clickedLabel) {
          await wait(CONFIG.selectionSettleMs);
          return clickedLabel || dropdownDisplayedValue(config);
        }

        if (displayed && displayed !== initialValue && hasAssignedDropdownValue(displayed) && !modalIsLoading(activeContent)) {
          return displayed;
        }
        await wait(100);
      }
      return "";
    } finally {
      document.removeEventListener("click", handleOptionClick, true);
    }
  }

  async function waitForManualCategory(config, initialValue, content) {
    const deadline = Date.now() + CONFIG.manualSelectionWaitMs;
    while (Date.now() < deadline) {
      const displayed = dropdownDisplayedValue(config);
      if (!findDropdownContent(config) && hasAssignedDropdownValue(displayed) && !modalIsLoading(content)) {
        return displayed;
      }
      await wait(150);
    }
    return "";
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

  async function selectOption(option, config, value) {
    dispatchPointerClick(option);
    await wait(CONFIG.stepWaitMs);
    const selected = () => option.getAttribute("aria-checked") === "true" ||
      option.getAttribute("aria-selected") === "true" ||
      Boolean(option.querySelector('input[type="radio"]:checked, input[type="checkbox"]:checked')) ||
      dropdownValueContains(config, value);
    if (selected()) return true;
    if (option.isConnected) option.click();
    await wait(CONFIG.stepWaitMs);
    return selected();
  }

  async function fillCustomDropdown(control, config, values, fieldName) {
    let modalResult = null;
    try {
      control.scrollIntoView({ behavior: "smooth", block: "center" });
      dispatchPointerClick(control);
      modalResult = await waitForDropdownContent(config);
      if (!modalResult) {
        console.warn(`[SpeedyList] ${fieldName} dialog did not appear; trigger:`, control.outerHTML);
        return false;
      }

      if (config.mode === "manualCategory") {
        const sourcePath = categoryPath(values).join(" > ");
        const initialValue = dropdownDisplayedValue(config);
        showStatus(`Choose the Vinted category${sourcePath ? ` (Depop: ${sourcePath})` : ""}; waiting for your selection...`);
        const selectedCategory = await waitForManualCategory(config, initialValue, modalResult.content);
        if (!selectedCategory) {
          dropdownWaitTimedOut = true;
          console.warn("[SpeedyList] Category selection was not completed; pausing dependent fields.");
          return false;
        }
        console.info("[SpeedyList] Manually selected category:", selectedCategory);
        return true;
      }

      if (config.mode === "manualSearch") {
        const requested = cleanText(values[0]);
        const searchInput = await waitForModalSearchInput(modalResult.content, config);
        if (!searchInput) {
          console.warn(`[SpeedyList] ${fieldName} search input not found; dialog:`, modalResult.content.outerHTML.slice(0, 3000));
          return false;
        }
        if (!setSearchValue(searchInput, requested)) {
          console.warn(`[SpeedyList] Could not set ${fieldName} query; input:`, searchInput.outerHTML);
          return false;
        }
        await wait(CONFIG.searchSettleMs);
        const currentInput = findModalSearchInput(modalResult.content, config);
        console.info(`[SpeedyList] ${fieldName} query:`, currentInput?.value || requested);
        const initialValue = dropdownDisplayedValue(config);
        showStatus(`${fieldName} search filled with "${requested}". Click the matching option; waiting...`);
        const selected = await waitForManualSelection(config, requested, initialValue, modalResult.content);
        if (!selected) {
          dropdownWaitTimedOut = true;
          console.warn(`[SpeedyList] Manual ${fieldName} selection timed out for "${requested}".`);
          return false;
        }
        console.info(`[SpeedyList] Manually selected ${fieldName}:`, selected);
        return true;
      }

      const requestedValues = Array.isArray(values) ? values : [values];
      const maxSelections = config.maxSelections || requestedValues.length;
      const valuesToSelect = requestedValues.slice(0, maxSelections);
      const skipped = requestedValues.slice(maxSelections);
      if (skipped.length) {
        console.warn(`[SpeedyList] Skipped ${fieldName} beyond its limit of ${maxSelections}:`, skipped);
      }

      let failed = false;
      const selectedValues = [];
      for (const [index, value] of valuesToSelect.entries()) {
        if (!modalResult.content.isConnected) {
          control = findFieldControl(fieldName, config, true);
          if (!control) {
            console.warn(`[SpeedyList] Could not reopen ${fieldName} picker.`);
            failed = true;
            break;
          }
          dispatchPointerClick(control);
          modalResult = await waitForDropdownContent(config);
        }
        if (!modalResult?.content) {
          console.warn(`[SpeedyList] ${fieldName} dialog did not render.`);
          failed = true;
          break;
        }

        const options = visibleDropdownOptions(modalResult.content);
        const option = matchDropdownOption(options, value);
        if (!option) {
          logVisibleOptions(modalResult.content, fieldName);
          if (fieldName === "material") {
            console.warn(`[SpeedyList] No Vinted material match for "${value}"; continuing.`);
            continue;
          }
          if (fieldName === "colors") {
            console.warn(`[SpeedyList] Vinted does not offer color "${value}"; skipping it.`);
            continue;
          }
          failed = true;
          break;
        }

        const selected = await selectOption(option, config, value);
        if (!selected) {
          console.warn(`[SpeedyList] Could not select ${fieldName} option "${value}".`);
          failed = true;
          break;
        }
        selectedValues.push(optionLabel(option));
        console.info(`[SpeedyList] Selected ${fieldName}:`, optionLabel(option));
        if (!config.multiple) break;
        if (index < valuesToSelect.length - 1) await wait(CONFIG.stepWaitMs);
      }

      if (failed || !selectedValues.length) return false;
      const verified = verifyDropdownValue(config, selectedValues, fieldName);
      return verified;
    } finally {
      closeDropdown(modalResult?.content, config);
    }
  }

  function fillPackageSize(value, config) {
    const requested = cleanText(value);
    const candidates = config.options.map((option) => ({
      ...option,
      title: document.querySelector(`[data-testid="${option.titleTestId}"]`),
      input: document.querySelector(`[data-testid="${option.inputTestId}"]`)
    }));
    const match = candidates.find(({ title }) => title && cleanText(title.textContent) === requested) ||
      candidates.find(({ title }) => title && cleanText(title.textContent).toLowerCase() === requested.toLowerCase()) ||
      candidates.find(({ title }) => title && cleanText(title.textContent).toLowerCase().includes(requested.toLowerCase()));

    if (!match) {
      console.warn(`[SpeedyList] No Package size match for "${requested}". Visible labels:`, candidates.map(({ title }) => cleanText(title?.textContent)).filter(Boolean));
      return false;
    }

    const cell = match.title.closest('[role="radio"], label, [data-testid*="package_type_selector"]') || match.title.parentElement;
    const target = match.input && visible(match.input) ? match.input : cell || match.title;
    dispatchPointerClick(target);
    if (match.input && !match.input.checked) match.input.click();
    const selected = match.input?.checked || cell?.getAttribute("aria-checked") === "true" || cell?.getAttribute("aria-selected") === "true";
    console.info(`[SpeedyList] Package size ${selected ? "selected" : "clicked"}:`, requested);
    return Boolean(selected || target);
  }

  async function fillDropdown(control, config, value, name) {
    const values = config.drilldown
      ? categoryPath(value)
      : config.multiple ? (Array.isArray(value) ? value : [value]) : [value];
    return fillCustomDropdown(control, config, values, name);
  }

  function hasValue(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(cleanText(value));
  }

  function fieldHasValue(control, fieldName, config) {
    const displayed = fieldValue(config);
    if (hasAssignedDropdownValue(displayed)) return true;

    if (config.type === "package") {
      return config.options.some((option) => {
        const input = document.querySelector(`[data-testid="${option.inputTestId}"]`);
        return Boolean(input?.checked || input?.getAttribute("aria-checked") === "true");
      });
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
    try {
      for (const name of CONFIG.fillOrder) {
        const config = CONFIG.fields[name];
        let value = payload.listing[name];
        if (!hasValue(value)) {
          if (!config.optional) {
            console.warn(`[SpeedyList] No source value for ${name}; keeping payload for retry.`);
            failed = true;
          }
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
        const success = config.type === "package"
          ? fillPackageSize(value, config)
          : config.type === "dropdown"
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

      if (failed) {
        console.warn("[SpeedyList] Required fields remain unmatched; payload retained in storage.");
        showStatus(
          dropdownWaitTimedOut
            ? "Picker selection timed out. Complete the selection, then click Retry empty fields."
            : "Some fields need attention. The saved copy is still available.",
          true
        );
        return;
      }
      clearPayload();
    } catch (error) {
      console.error("[SpeedyList] Unexpected fill error:", error);
      showStatus("A fill error occurred. The saved copy is still available; check the page console.", true);
    } finally {
      filling = false;
      updateRetryButton();
    }
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