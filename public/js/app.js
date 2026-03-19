document.addEventListener("DOMContentLoaded", () => {
  const uploadZone = document.querySelector("[data-upload-zone]");
  const fileInput = document.querySelector("[data-upload-input]");
  const hiddenInput = document.querySelector("[data-upload-hidden]");
  const preview = document.querySelector("[data-upload-preview]");
  const label = document.querySelector("[data-upload-label]");
  const sidebarFilterForm = document.querySelector("[data-sidebar-filters]");

  if (sidebarFilterForm) {
    sidebarFilterForm.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        sidebarFilterForm.submit();
      });
    });
  }

  if (!uploadZone || !fileInput || !hiddenInput) {
    return;
  }

  const syncUploadPreview = (dataUrl, fileName) => {
    hiddenInput.value = dataUrl || "";

    if (!preview) {
      return;
    }

    preview.innerHTML = "";

    if (!dataUrl) {
      return;
    }

    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = "Ticket upload preview";
    image.className = "upload-preview-image";
    preview.appendChild(image);

    if (label && fileName) {
      label.textContent = `[ ${fileName} ]`;
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
