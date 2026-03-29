document.addEventListener("DOMContentLoaded", () => {
  const sidebarFilterForm = document.querySelector("[data-sidebar-filters]");
  const supportDrawer = document.querySelector("[data-support-drawer]");
  const supportBackdrop = document.querySelector("[data-support-backdrop]");
  const supportOpenButtons = document.querySelectorAll("[data-open-support-drawer]");
  const supportCloseButtons = document.querySelectorAll("[data-close-support-drawer]");
  const supportConversationTriggers = document.querySelectorAll("[data-support-conversation-trigger]");
  const supportConversationPanels = document.querySelectorAll("[data-support-conversation-panel]");
  const supportUnreadBadge = document.querySelector("[data-support-unread-badge]");

  if (sidebarFilterForm) {
    sidebarFilterForm.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        sidebarFilterForm.submit();
      });
    });
  }

  const reduceSupportUnreadBadge = () => {
    if (!supportUnreadBadge) {
      return;
    }

    const currentValue = Number(supportUnreadBadge.textContent || "0");
    if (currentValue <= 1) {
      supportUnreadBadge.remove();
      return;
    }

    supportUnreadBadge.textContent = String(currentValue - 1);
  };

  const markSupportConversationRead = (conversationId, shouldReduceBadge = false) => {
    if (!conversationId) {
      return;
    }

    fetch(`/support/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});

    const activeTrigger = document.querySelector(`[data-support-conversation-trigger][data-conversation-id="${conversationId}"]`);
    if (activeTrigger?.classList.contains("unread")) {
      activeTrigger.classList.remove("unread");
      const unreadDot = activeTrigger.querySelector(".support-unread-dot");
      unreadDot?.remove();
      reduceSupportUnreadBadge();
      return;
    }

    if (shouldReduceBadge) {
      reduceSupportUnreadBadge();
    }
  };

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

    markSupportConversationRead(conversationId);
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
    } else {
      const ownConversationId = supportDrawer.getAttribute("data-support-conversation-id") || "";
      if (ownConversationId) {
        markSupportConversationRead(ownConversationId, true);
      } else {
        const firstConversationId = supportConversationTriggers[0]?.getAttribute("data-conversation-id") || "";
        if (firstConversationId) {
          setActiveSupportConversation(firstConversationId);
        }
      }
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

  document.querySelectorAll("[data-profile-image-editor]").forEach((editor) => {
    const fileInput = editor.querySelector("[data-profile-image-input]");
    const hiddenInput = editor.querySelector("[data-profile-image-hidden]");
    const display = editor.querySelector("[data-profile-image-display]");
    const toggleButton = editor.querySelector("[data-profile-image-toggle]");
    const viewButton = editor.querySelector("[data-profile-image-view]");
    const changeButton = editor.querySelector("[data-profile-image-change]");
    const removeButton = editor.querySelector("[data-profile-image-remove]");
    const modal = editor.querySelector("[data-profile-image-modal]");
    const modalImage = editor.querySelector("[data-profile-image-modal-img]");
    const modalCloseButtons = editor.querySelectorAll("[data-profile-image-close]");

    if (!fileInput || !hiddenInput || !display || !toggleButton) {
      return;
    }

    const ensurePreviewImage = () => {
      let previewImage = display.querySelector("[data-profile-image-img]");
      if (!previewImage) {
        previewImage = document.createElement("img");
        previewImage.className = "profile-avatar-image";
        previewImage.setAttribute("data-profile-image-img", "");
        previewImage.alt = "Profile preview";
        display.prepend(previewImage);
      }
      return previewImage;
    };

    const ensureFallback = () => {
      let fallback = display.querySelector("[data-profile-image-fallback]");
      if (!fallback) {
        fallback = document.createElement("span");
        fallback.className = "profile-avatar-fallback";
        fallback.setAttribute("data-profile-image-fallback", "");
        fallback.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>';
        display.prepend(fallback);
      }
      return fallback;
    };

    const setMenuOpen = (isOpen) => {
      editor.classList.toggle("is-open", isOpen);
    };

    const syncProfileImage = (dataUrl) => {
      const hasImage = Boolean(dataUrl);
      hiddenInput.value = dataUrl || "";
      editor.classList.toggle("has-image", hasImage);
      display.classList.toggle("has-image", hasImage);

      const previewImage = ensurePreviewImage();
      const fallback = ensureFallback();

      if (hasImage) {
        previewImage.src = dataUrl;
        previewImage.hidden = false;
        fallback.hidden = true;
        if (modalImage) {
          modalImage.src = dataUrl;
        }
      } else {
        previewImage.hidden = true;
        previewImage.removeAttribute("src");
        fallback.hidden = false;
        if (modalImage) {
          modalImage.removeAttribute("src");
        }
      }

      if (viewButton) {
        viewButton.disabled = !hasImage;
      }
      if (removeButton) {
        removeButton.disabled = !hasImage;
      }
    };

    const readFile = (file) => {
      if (!file || !file.type.startsWith("image/")) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        syncProfileImage(String(reader.result || ""));
        setMenuOpen(false);
      };
      reader.readAsDataURL(file);
    };

    toggleButton.addEventListener("click", () => {
      setMenuOpen(!editor.classList.contains("is-open"));
    });

    display.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setMenuOpen(!editor.classList.contains("is-open"));
      }
    });

    if (changeButton) {
      changeButton.addEventListener("click", () => {
        fileInput.click();
      });
    }

    if (removeButton) {
      removeButton.addEventListener("click", () => {
        fileInput.value = "";
        syncProfileImage("");
        setMenuOpen(false);
      });
    }

    if (viewButton) {
      viewButton.addEventListener("click", () => {
        if (!hiddenInput.value || !modal) {
          return;
        }
        modal.classList.add("is-open");
        setMenuOpen(false);
      });
    }

    modalCloseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        modal?.classList.remove("is-open");
      });
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      readFile(file);
    });

    document.addEventListener("click", (event) => {
      if (!editor.contains(event.target)) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        modal?.classList.remove("is-open");
      }
    });

    syncProfileImage(hiddenInput.value);
  });

  document.querySelectorAll(".support-composer textarea").forEach((textarea) => {
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }

      event.preventDefault();
      textarea.closest("form")?.requestSubmit();
    });
  });
});
