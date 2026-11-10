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
    fieldPicker: document.getElementById("field-picker"),
    copyButton: document.getElementById("copy-button"),
    status: document.getElementById("status")
  };

  let activeTabId;
  let currentListing;

  function valueText(value) {
    if (Array.isArray(value)) return value.join(", ");
    return typeof value === "string" ? value : value == null ? "" : String(value);
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.dataset.error = String(isError);
  }

  function renderFields(payload) {
    currentListing = payload?.listing || null;
    elements.fieldList.replaceChildren();
    elements.fieldPicker.replaceChildren();
    const availableFields = [];

    for (const [key, label] of CONFIG.fields) {
      const value = currentListing ? valueText(currentListing[key]) : "";
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value || "Not set";
      detail.classList.toggle("is-empty", !value);
      elements.fieldList.append(term, detail);

      if (value) availableFields.push({ key, label, value });
    }

    if (!currentListing) {
      elements.sourceNote.textContent = "No saved listing yet";
      setStatus("Capture a Depop edit page to load its fields.");
    } else {
      const date = payload.createdAt ? new Date(payload.createdAt).toLocaleString() : "Saved listing";
      elements.sourceNote.textContent = date;
      setStatus(`${availableFields.length} saved fields ready to copy.`);
    }

    if (!availableFields.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No fields available";
      elements.fieldPicker.append(option);
    } else {
      for (const field of availableFields) {
        const option = document.createElement("option");
        option.value = field.key;
        option.textContent = field.label;
        elements.fieldPicker.append(option);
      }
    }

    elements.fieldPicker.disabled = availableFields.length === 0;
    elements.copyButton.disabled = availableFields.length === 0;
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

  async function copySelectedField() {
    const key = elements.fieldPicker.value;
    const value = currentListing ? valueText(currentListing[key]) : "";
    if (!value) {
      setStatus("This field has no saved value.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      const label = CONFIG.fields.find(([fieldKey]) => fieldKey === key)?.[1] || key;
      setStatus(`${label} copied.`);
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
  elements.copyButton.addEventListener("click", copySelectedField);
  elements.fieldPicker.addEventListener("change", () => {
    const label = CONFIG.fields.find(([key]) => key === elements.fieldPicker.value)?.[1];
    const value = currentListing ? valueText(currentListing[elements.fieldPicker.value]) : "";
    if (label && value) setStatus(`${label} selected. Click Copy selected to copy it.`);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[CONFIG.storageKey]) {
      renderFields(changes[CONFIG.storageKey].newValue);
    }
  });
})();