(() => {
  "use strict";

  const CONFIG = {
    storageKey: "speedlist.pendingListing",
    scrapeMessage: "speedlist:scrape-listing",
    depopEditPattern: /^https:\/\/www\.depop\.com\/products\/edit\/[^/?#]+/i,
    fields: [
      ["title", "Title"],
      ["description", "Description"],
      ["category", "Category"],
      ["material", "Material"],
      ["brand", "Brand"],
      ["size", "Size"],
      ["condition", "Condition"],
      ["colors", "Colors"],
      ["packageSize", "Package size"],
      ["price", "Price"]
    ]
  };

  const elements = {
    sourceNote: document.getElementById("source-note"),
    captureButton: document.getElementById("capture-button"),
    fieldList: document.getElementById("field-list"),
    status: document.getElementById("status")
  };

  let activeTabId;
  let currentListing;

  function valueText(value) {
    if (Array.isArray(value)) return value.join(", ");
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  function setStatus(message, isError = false, isSuccess = false) {
    elements.status.textContent = message;
    elements.status.dataset.error = String(isError);
    elements.status.dataset.success = String(isSuccess);
  }

  function renderFields(payload) {
    currentListing = payload?.listing || null;
    elements.fieldList.replaceChildren();
    let availableCount = 0;

    for (const [key, label] of CONFIG.fields) {
      const value = currentListing ? valueText(currentListing[key]) : "";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "field-row";
      row.dataset.field = key;
      row.disabled = !value;
      row.setAttribute("aria-label", value ? `Copy ${label} to clipboard` : `${label}, not set`);

      const name = document.createElement("span");
      name.className = "field-name";
      name.textContent = label;
      const detail = document.createElement("span");
      detail.className = "field-value";
      detail.classList.toggle("is-empty", !value);
      detail.textContent = value || "Not set";
      const hint = document.createElement("span");
      hint.className = "field-copy-hint";
      hint.textContent = value ? "COPY" : "";
      row.append(name, detail, hint);
      elements.fieldList.append(row);

      if (value) availableCount += 1;
    }

    if (!currentListing) {
      elements.sourceNote.textContent = "No saved listing yet";
      setStatus("Capture a Depop edit page to load its fields.");
    } else {
      const date = payload.createdAt ? new Date(payload.createdAt).toLocaleString() : "Saved listing";
      elements.sourceNote.textContent = date;
      setStatus(`${availableCount} saved fields ready.`);
    }
  }

  function loadSavedListing() {
    chrome.storage.local.get(CONFIG.storageKey, (result) => {
      if (chrome.runtime.lastError) {
        setStatus(`Could not read saved listing: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      renderFields(result[CONFIG.storageKey]);
    });
  }

  function setActionFeedback(ok, message) {
    chrome.action.setBadgeBackgroundColor({ color: ok ? "#176b57" : "#9b3d34" });
    chrome.action.setBadgeText({ text: ok ? "OK" : "!" });
    chrome.action.setTitle({ title: `SpeedyList: ${message}` });
  }

  function captureCurrentTab() {
    if (typeof activeTabId !== "number") {
      setStatus("Could not identify the active tab.", true);
      setActionFeedback(false, "Could not identify the active tab");
      return;
    }

    elements.captureButton.disabled = true;
    elements.captureButton.textContent = "Capturing...";
    setStatus("Reading Depop edit fields...");

    chrome.tabs.sendMessage(activeTabId, { type: CONFIG.scrapeMessage }, (response) => {
      elements.captureButton.disabled = false;
      elements.captureButton.textContent = "Capture this Depop listing";

      if (chrome.runtime.lastError) {
        const message = "No Depop edit-page script responded. Reload the extension and page.";
        setStatus(message, true);
        setActionFeedback(false, message);
        return;
      }
      if (!response?.ok) {
        const message = response?.error || "Listing could not be saved.";
        setStatus(message, true);
        setActionFeedback(false, message);
        return;
      }

      loadSavedListing();
      const warningText = response.warningCount ? ` Saved with ${response.warningCount} missing field(s); check the page console.` : " Listing saved.";
      setStatus(warningText.trim(), Boolean(response.warningCount));
      setActionFeedback(true, "Listing data saved");
    });
  }

  async function copyField(key) {
    const value = currentListing ? valueText(currentListing[key]) : "";
    if (!value) {
      setStatus("This field has no saved value.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      const label = CONFIG.fields.find(([fieldKey]) => fieldKey === key)?.[1] || key;
      setStatus(`${label} copied.`, false, true);
    } catch (error) {
      console.warn("[SpeedyList] Clipboard write failed:", error);
      setStatus("Clipboard copy failed. Check the clipboard permission.", true);
    }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    activeTabId = tab?.id;
    elements.captureButton.hidden = !CONFIG.depopEditPattern.test(tab?.url || "");
    if (elements.captureButton.hidden) {
      elements.sourceNote.textContent = "Saved listing fields from Depop";
    }
    loadSavedListing();
  });

  elements.captureButton.addEventListener("click", captureCurrentTab);
  elements.fieldList.addEventListener("click", (event) => {
    const row = event.target.closest(".field-row");
    if (row && elements.fieldList.contains(row) && !row.disabled) {
      copyField(row.dataset.field);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[CONFIG.storageKey]) {
      renderFields(changes[CONFIG.storageKey].newValue);
    }
  });
})();