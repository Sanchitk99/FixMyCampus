document.addEventListener("DOMContentLoaded", () => {
  const sidebarFilterForm = document.querySelector("[data-sidebar-filters]");
  const supportDrawer = document.querySelector("[data-support-drawer]");
  const supportBackdrop = document.querySelector("[data-support-backdrop]");
  const supportOpenButtons = document.querySelectorAll("[data-open-support-drawer]");
  const supportCloseButtons = document.querySelectorAll("[data-close-support-drawer]");
  const supportConversationTriggers = document.querySelectorAll("[data-support-conversation-trigger]");
  const supportConversationPanels = document.querySelectorAll("[data-support-conversation-panel]");

  if (sidebarFilterForm) {
    sidebarFilterForm.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        sidebarFilterForm.submit();
      });
    });
  }

  const setActiveSupportConversation = (conversationId) => {
    if (!conversationId) {
      return;
    }

    supportConversationTriggers.forEach((trigger) => {
      trigger.classList.toggle("active", trigger.getAttribute("data-conversation-id") === conversationId);
    });

    supportConversationPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.getAttribute("data-conversation-id") === conversationId);
    });
  };

  const openSupportDrawer = (conversationId = "") => {
    if (!supportDrawer || !supportBackdrop) {
      return;
    }

    supportDrawer.classList.add("is-open");
    supportBackdrop.classList.add("is-open");
    document.body.classList.add("support-drawer-open");

    if (conversationId) {
      setActiveSupportConversation(conversationId);
    }
  };

  const closeSupportDrawer = () => {
    if (!supportDrawer || !supportBackdrop) {
      return;
    }

    supportDrawer.classList.remove("is-open");
    supportBackdrop.classList.remove("is-open");
    document.body.classList.remove("support-drawer-open");

    if (window.location.hash.startsWith("#support-chat")) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  };

  supportOpenButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openSupportDrawer();
    });
  });

  supportCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeSupportDrawer();
    });
  });

  if (supportBackdrop) {
    supportBackdrop.addEventListener("click", () => {
      closeSupportDrawer();
    });
  }

  supportConversationTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const conversationId = trigger.getAttribute("data-conversation-id") || "";
      setActiveSupportConversation(conversationId);
      if (conversationId) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}#support-chat-${conversationId}`);
      }
    });
  });

  const hash = window.location.hash || "";
  if (hash === "#support-chat") {
    openSupportDrawer();
  } else if (hash.startsWith("#support-chat-")) {
    openSupportDrawer(hash.replace("#support-chat-", ""));
  }

  document.querySelectorAll("[data-upload-zone]").forEach((uploadZone) => {
    const wrapper = uploadZone.closest("label, .upload-label, form, section") || uploadZone.parentElement;
    const fileInput = wrapper?.querySelector("[data-upload-input]");
    const hiddenInput = wrapper?.querySelector("[data-upload-hidden]");
    const preview = wrapper?.querySelector("[data-upload-preview]");
    const label = wrapper?.querySelector("[data-upload-label]");

    if (!fileInput || !hiddenInput) {
      return;
    }

    const defaultLabel = label?.textContent || "";

    const syncUploadPreview = (dataUrl, fileName) => {
      hiddenInput.value = dataUrl || "";

      if (!preview) {
        return;
      }

      preview.innerHTML = "";

      if (!dataUrl) {
        if (label) {
          label.textContent = defaultLabel;
        }
        return;
      }

      const image = document.createElement("img");
      image.src = dataUrl;
      image.alt = "Upload preview";
      image.className = "upload-preview-image";
      preview.appendChild(image);

      if (label && fileName) {
        label.textContent = fileName;
      }
    };

    const readFile = (file) => {
      if (!file || !file.type.startsWith("image/")) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        syncUploadPreview(String(reader.result || ""), file.name);
      };
      reader.readAsDataURL(file);
    };

    uploadZone.addEventListener("click", () => {
      fileInput.click();
    });

    uploadZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadZone.classList.add("is-dragging");
    });

    uploadZone.addEventListener("dragleave", () => {
      uploadZone.classList.remove("is-dragging");
    });

    uploadZone.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadZone.classList.remove("is-dragging");
      const file = event.dataTransfer?.files?.[0];
      readFile(file);
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      readFile(file);
    });
  });
});
