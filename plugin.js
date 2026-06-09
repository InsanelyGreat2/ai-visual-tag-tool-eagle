(function () {
  const nodeRequire = typeof require === "function" ? require : null;
  const fs = nodeRequire ? nodeRequire("fs") : null;
  const os = nodeRequire ? nodeRequire("os") : null;
  const path = nodeRequire ? nodeRequire("path") : null;
  const cp = nodeRequire ? nodeRequire("child_process") : null;
  const url = nodeRequire ? nodeRequire("url") : null;

  const STORAGE_KEYS = {
    customAllowedTags: "vfxAiTagger.customAllowedTags",
    disabledTags: "vfxAiTagger.disabledTags",
    settings: "vfxAiTagger.settings",
    results: "vfxAiTagger.results",
    undoStack: "vfxAiTagger.undoStack",
    defaultTemplateTags: "vfxAiTagger.defaultTemplateTags",
    collectorWindowBounds: "vfxAiTagger.collectorWindowBounds",
    restoreWorkbenchBounds: "vfxAiTagger.restoreWorkbenchBounds"
  };

  const APP_TITLE = "AI视觉标签助手";
  const SUPPORTED_LOCALES = ["zh_CN"];
  const LOCALE_FILE_BY_LOCALE = Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${locale}.json`]));
  const TRANSLATIONS = {
    zh_CN: {
      appTitle: APP_TITLE,
      "manifest.app.name": APP_TITLE,
      "status.waiting": "等待读取 Eagle 资源"
    }
  };
  let currentLocale = "zh_CN";

  const DEFAULT_VFX_TAGS = [
    "爆炸", "火焰", "闪电", "冰冻", "烟雾", "冲击波", "光束", "法阵", "传送门", "能量球",
    "护盾", "拖尾", "命中特效", "技能释放", "蓄力", "受击", "循环特效", "环境特效", "UI特效", "屏幕特效",
    "预警", "环绕", "范围圈", "弹幕", "吐息", "瀑布", "螺旋", "碎片", "增益", "减益",
    "刀光", "枪械", "地刺", "地裂", "治疗", "召唤", "附魔", "消失", "冲刺", "破碎",
    "火", "冰", "雷", "电", "风", "水", "毒", "暗", "光", "能量", "机械", "自然", "时间", "草地", "星空",
    "植物", "血",
    "红色", "蓝色", "紫色", "金色", "绿色", "白色", "黑色", "黄色", "橙色", "青色",
    "攻击", "释放", "循环", "转场", "场景氛围",
    "写实", "卡通", "二次元", "科幻", "魔幻", "低多边形", "国风", "水墨风"
  ];
  const TAG_SEMANTIC_RULES = [
    ["预警", "技能生效前的范围提示、红圈、地面警示、AOE 提示，不等同于普通 UI。"],
    ["环绕", "围绕角色、目标或中心点的轨道运动；普通原地旋转不一定选择。"],
    ["范围圈", "地面圆圈、AOE 圆环、区域边界或法术范围提示；可与法阵共现。"],
    ["弹幕", "多发、密集、成组的投射物；单个飞行物优先考虑弹道或飞行道具。"],
    ["吐息", "从口部或生物头部喷出的锥形火、毒、冰、雾等，不等同于普通喷发。"],
    ["瀑布", "垂直下落或连续落下的水流，不是普通水花。"],
    ["螺旋", "明显螺旋、涡旋、双螺旋或钻头式运动；普通转圈不一定选择。"],
    ["碎片", "飞散残骸、小块 debris；破碎偏过程，碎片偏飞散物体。"],
    ["增益", "治疗、强化、护体、正面状态或能力提升。"],
    ["减益", "中毒、诅咒、减速、沉默、虚弱等负面状态。"],
    ["法阵", "魔法/技能图形阵、符号圈或召唤阵；统一使用法阵，不使用旧称。"],
    ["刀光", "剑刃弧线、挥砍拖尾、斩击轨迹。"],
    ["枪械", "枪炮、枪口、射击类上位标签；不要把普通弹道都归为枪械。"],
    ["地刺", "从地面刺出的冰刺、岩刺、尖刺等。"],
    ["地裂", "地面裂缝、裂开、裂纹扩散。"],
    ["治疗", "回复、治愈、恢复类特效；不要只因绿色就选择。"],
    ["召唤", "角色、物体、生物、法阵或能量体出现/生成。"],
    ["附魔", "武器或物体表面附着能量、元素强化。"],
    ["消失", "淡出、散去、分解、溶解式离场；不等同于隐身。"],
    ["冲刺", "高速向前移动；不等同于闪身或刺击。"],
    ["植物", "藤蔓、叶片、根须、自然有机生长。"],
    ["血", "血液、血溅或红色液体；不要只因红色就选择。"],
    ["破碎", "碎裂过程或破坏过程。"],
    ["屏幕特效", "屏幕边缘、全屏扰动、受击遮罩、屏幕纹理，不等同于 UI特效。"],
    ["国风", "中式题材、武侠、东方图案或传统文化风格。"],
    ["水墨风", "整体水墨气质或国风水墨风格；水墨纹理不明显时不要强选。"]
  ];

  const STATIC_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "bmp", "tif", "tiff", "heic", "avif"]);
  const CONVERTIBLE_IMAGE_EXTS = new Set(["tga", "dds"]);
  const WEBP_EXT = "webp";
  const ANIMATED_EXTS = new Set(["gif", "apng"]);
  const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "avi", "mkv", "ts", "m4v", "wmv"]);
  const PREVIEW_EXTS = new Set(["svg", "psd", "ai", "pdf", "eps", "sketch"]);
  const DIAGNOSTIC_PREVIEW_LIMIT = 8;
  const SELECTED_TRAY_LIMIT = 3;
  const AI_REQUEST_TIMEOUT_MS = 90000;
  const AI_RETRY_COUNT = 2;
  const AI_RETRY_BASE_DELAY_MS = 1200;
  const DEFAULT_REQUEST_CHUNK_K = 256;
  const MIN_REQUEST_CHUNK_K = 4;
  const MAX_REQUEST_CHUNK_K = 256;
  const REQUEST_SAFETY_TOKENS = 512;
  const MIN_TAG_BUDGET_TOKENS = 512;
  const ESTIMATED_IMAGE_TOKENS = 3072;
  const ANALYSIS_PRESETS = {
    "快速粗标": {
      maxTags: 6,
      concurrency: 3,
      aiRetryCount: 1,
      requestChunkK: 128,
      autoConfidence: 0.85,
      hideConfidence: 0.55,
      frameRateValue: 1,
      frameRateUnit: "spf",
      maxVideoFrames: 18,
      maxAnimatedFrames: 10
    },
    "精细分析": {
      maxTags: 12,
      concurrency: 1,
      aiRetryCount: 3,
      requestChunkK: 192,
      autoConfidence: 0.78,
      hideConfidence: 0.35,
      frameRateValue: 1,
      frameRateUnit: "fps",
      maxVideoFrames: 72,
      maxAnimatedFrames: 36
    },
    "长视频省钱": {
      maxTags: 8,
      concurrency: 1,
      aiRetryCount: 1,
      requestChunkK: 96,
      autoConfidence: 0.82,
      hideConfidence: 0.5,
      frameRateValue: 2,
      frameRateUnit: "spf",
      maxVideoFrames: 20,
      maxAnimatedFrames: 12
    }
  };
  const COLLECTOR_WINDOW_BOUNDS = {
    width: 646,
    height: 104,
    topOffset: 61
  };
  const WORKBENCH_WINDOW_BOUNDS = {
    width: 1180,
    height: 760
  };
  const COLLECTOR_SCREEN_MARGIN = 8;
  const COLLECTOR_RESTORE_TOLERANCE = 24;

  const els = {};
  const state = {
    running: false,
    selectedItems: [],
    itemSource: "eagle",
    eagleTagRecords: [],
    eagleTags: [],
    eagleTagGroups: [],
    selectedTagGroupName: "__all",
    customAllowedTags: [],
    disabledTags: [],
    sessionRemovedTags: [],
    defaultTemplateTags: [],
    undoStack: [],
    results: [],
    healthStatus: [],
    activeResultFilter: "all",
    activePresetName: "",
    analysisAbortController: null,
    collectorPreviousBounds: null,
    collectorPreviousAlwaysOnTop: false,
    mediaPreview: {
      open: false,
      itemId: "",
      resultId: "",
      order: []
    },
    pauseRequested: false,
    paused: false,
    writing: false
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    [
      "statusText", "openAiBtn", "appendSelectedBtn", "replaceSelectedBtn", "clearSelectedBtn", "miniCollectorBtn", "analyzeBtn", "pauseBtn", "continueBtn", "restartBtn", "applyBtn", "undoBtn", "closeWindowBtn", "selectedCount", "tagPoolCount",
      "readyCount", "failedCount", "tagInput", "addTagBtn", "tagSearch", "refreshTagsBtn",
      "importDefaultsBtn", "manageDefaultTemplateBtn", "defaultTemplateOverlay", "defaultTemplateDialog", "defaultTemplateSearch", "defaultTemplateInput", "addDefaultTemplateTagBtn", "defaultTemplateList", "resetDefaultTemplateBtn", "importEditedDefaultTemplateBtn", "closeDefaultTemplateBtn", "tagGroupSelect", "tagPool", "maxTags", "concurrency", "aiRetryCount", "requestChunkK", "autoConfidence", "hideConfidence", "frameRateValue", "frameRateUnit",
      "maxVideoFrames", "maxAnimatedFrames", "skipStart", "skipEnd", "skipTagged", "previewBeforeWrite", "autoApplyHighConfidence", "allowOutOfPoolSuggestions",
      "writeAnnotation", "includeTitleInPrompt", "diagnosticEnabled", "diagnosticDir", "chooseDiagnosticDirBtn", "globalPrompt", "frameRateHint", "selectedSummary",
      "selectedItems", "showSelectedListBtn", "selectedListOverlay", "selectedListDialog", "selectedItemsFullList", "closeSelectedListBtn",
      "collectorBar", "collectorCount", "collectorStatus", "collectorAppendBtn", "collectorAnalyzeBtn", "collectorClearBtn", "collectorExpandBtn", "collectorCloseBtn",
      "results", "clearResultsBtn", "analysisProgressPanel", "analysisProgressText", "analysisProgressPercent", "analysisProgressBar", "analysisProgressMeta",
      "writeProgressPanel", "writeProgressText", "writeProgressPercent", "writeProgressBar", "writeProgressMeta",
      "mediaPreviewOverlay", "mediaPreviewDialog", "mediaPreviewTitle", "mediaPreviewMeta", "mediaPreviewBody", "mediaPreviewStatus", "mediaPreviewTags", "mediaPreviewReason",
      "mediaPreviewPrevBtn", "mediaPreviewNextBtn", "mediaPreviewOpenEagleBtn", "closeMediaPreviewBtn",
      "backendStatus", "refreshBackendStatusBtn",
      "healthCheckPanel", "healthSummary", "healthStatusList", "runHealthCheckBtn",
      "analysisPresetSelect", "applyPresetBtn", "presetHint", "retryFailedBtn",
      "settingsOverlay", "settingsDrawer", "closeSettingsBtn", "eagleAiSettingsBtn"
    ].forEach((id) => { els[id] = document.getElementById(id); });
    els.settingsTabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
    els.settingsPanels = Array.from(document.querySelectorAll("[data-settings-panel]"));
    els.resultFilterButtons = Array.from(document.querySelectorAll("[data-result-filter]"));

    currentLocale = resolveI18nLocale();
    loadLocaleFile("zh_CN");
    applyStaticI18n();
    loadStoredState();
    bindEvents();
    await ensureWorkbenchWindowBounds();
    await refreshAll();
    await runHealthCheck({ silent: true });
  }

  function resolveI18nLocale() {
    const i18nLanguage = window.i18next && (i18next.language || i18next.resolvedLanguage);
    const browserLanguage = typeof navigator !== "undefined" ? navigator.language : "";
    return normalizeLocale(i18nLanguage || browserLanguage);
  }

  function normalizeLocale(locale) {
    const value = String(locale || "").replace("_", "-").toLowerCase();
    return "zh_CN";
  }

  function loadLocaleFile(locale) {
    if (!fs || !path) return;
    const fileName = LOCALE_FILE_BY_LOCALE[locale];
    if (!fileName) return;
    const rootPath = getPluginRootPath();
    const localePath = rootPath ? path.join(rootPath, "_locales", fileName) : "";
    if (!localePath || !fs.existsSync(localePath)) return;
    try {
      const flat = flattenLocaleObject(JSON.parse(fs.readFileSync(localePath, "utf8")));
      if (Object.keys(flat).length) {
        TRANSLATIONS[locale] = { ...(TRANSLATIONS[locale] || {}), ...flat };
      }
    } catch (error) {
      console.warn("Failed to load locale file", locale, error);
    }
  }

  function getPluginRootPath() {
    if (!path) return "";
    if (typeof __dirname === "string" && __dirname) return __dirname;
    const pathname = window.location && window.location.pathname ? decodeURIComponent(window.location.pathname) : "";
    if (!pathname) return "";
    const normalized = pathname.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, path.sep);
    return path.dirname(normalized);
  }

  function flattenLocaleObject(value, prefix = "", output = {}) {
    if (!value || typeof value !== "object") return output;
    Object.entries(value).forEach(([key, child]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) {
        flattenLocaleObject(child, nextKey, output);
      } else if (typeof child === "string" && !isBrokenTranslation(child)) {
        output[nextKey] = child;
      }
    });
    return output;
  }

  function t(key, params = {}) {
    let text = "";
    const fallbackLocales = ["zh_CN"];
    for (const locale of fallbackLocales) {
      text = TRANSLATIONS[locale] && TRANSLATIONS[locale][key];
      if (text && !isBrokenTranslation(text)) break;
    }
    if (!text || isBrokenTranslation(text)) text = key;
    return interpolateText(text, params);
  }

  function isBrokenTranslation(text) {
    const value = String(text || "");
    return /\?{3,}/.test(value) || /\uFFFD/.test(value);
  }

  function interpolateText(text, params = {}) {
    Object.entries(params).forEach(([name, value]) => {
      text = String(text).replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    });
    return text;
  }

  function applyStaticI18n() {
    document.documentElement.lang = currentLocale.replace("_", "-");
    document.title = t("appTitle");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    });
    document.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.setAttribute("title", t(node.dataset.i18nTitle));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });
  }

  function bindEvents() {
    els.openAiBtn.addEventListener("click", openSettingsDrawer);
    els.showSelectedListBtn.addEventListener("click", openSelectedListDialog);
    els.closeSelectedListBtn.addEventListener("click", closeSelectedListDialog);
    els.selectedListOverlay.addEventListener("click", closeSelectedListDialog);
    els.mediaPreviewOverlay.addEventListener("click", closeMediaPreview);
    els.closeMediaPreviewBtn.addEventListener("click", closeMediaPreview);
    els.mediaPreviewOpenEagleBtn.addEventListener("click", openPreviewInEagle);
    els.mediaPreviewPrevBtn.addEventListener("click", () => navigateMediaPreview(-1));
    els.mediaPreviewNextBtn.addEventListener("click", () => navigateMediaPreview(1));
    els.closeSettingsBtn.addEventListener("click", closeSettingsDrawer);
    els.settingsOverlay.addEventListener("click", closeSettingsDrawer);
    els.eagleAiSettingsBtn.addEventListener("click", openAiSettings);
    els.chooseDiagnosticDirBtn.addEventListener("click", chooseDiagnosticDir);
    els.diagnosticDir.addEventListener("input", saveSettings);
    els.settingsTabs.forEach((tab) => {
      tab.addEventListener("click", () => activateSettingsTab(tab.dataset.settingsTab));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSelectedListDialog();
        closeMediaPreview();
        closeDefaultTemplateDialog();
        closeSettingsDrawer();
        closeManualTagMenus();
        closePreviewManualTagMenus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".result-editor")) closeManualTagMenus();
      if (!event.target.closest(".media-preview-tag-editor")) closePreviewManualTagMenus();
    });
    window.addEventListener("resize", closeManualTagMenus);
    els.appendSelectedBtn.addEventListener("click", () => appendSelectedItems("追加当前选中"));
    els.replaceSelectedBtn.addEventListener("click", () => replaceSelectedItems("替换为当前选中"));
    els.clearSelectedBtn.addEventListener("click", () => clearSelectedQueue());
    els.miniCollectorBtn.addEventListener("click", enterCollectorMode);
    els.collectorAppendBtn.addEventListener("click", () => appendSelectedItems("采集条追加当前选中"));
    els.collectorAnalyzeBtn.addEventListener("click", async () => {
      const eagleWindow = getPluginWindowApi();
      await persistCollectorWindowBounds(eagleWindow);
      await exitCollectorMode();
      await analyzeSelected();
    });
    els.collectorClearBtn.addEventListener("click", () => clearSelectedQueue());
    els.collectorExpandBtn.addEventListener("click", exitCollectorMode);
    els.collectorCloseBtn.addEventListener("click", closePluginWindow);
    els.selectedItems.addEventListener("click", handleMediaPreviewClick);
    els.selectedItemsFullList.addEventListener("click", handleMediaPreviewClick);
    els.results.addEventListener("click", handleMediaPreviewClick);
    els.selectedItems.addEventListener("contextmenu", (event) => openWorkbenchContextMenu(event, "selected-panel"));
    els.selectedItemsFullList.addEventListener("contextmenu", (event) => openWorkbenchContextMenu(event, "selected-panel"));
    els.tagPool.addEventListener("contextmenu", (event) => openWorkbenchContextMenu(event, "tag-pool"));
    els.results.addEventListener("contextmenu", (event) => openWorkbenchContextMenu(event, "results"));
    els.refreshTagsBtn.addEventListener("click", refreshTags);
    els.importDefaultsBtn.addEventListener("click", importDefaultTags);
    els.manageDefaultTemplateBtn.addEventListener("click", openDefaultTemplateDialog);
    els.defaultTemplateOverlay.addEventListener("click", closeDefaultTemplateDialog);
    els.closeDefaultTemplateBtn.addEventListener("click", closeDefaultTemplateDialog);
    els.defaultTemplateSearch.addEventListener("input", renderDefaultTemplateList);
    els.addDefaultTemplateTagBtn.addEventListener("click", addDefaultTemplateTag);
    els.defaultTemplateInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addDefaultTemplateTag();
    });
    els.defaultTemplateList.addEventListener("change", (event) => {
      const input = event.target.closest("[data-default-template-rename]");
      if (input) renameDefaultTemplateTag(input.dataset.defaultTemplateRename, input.value);
    });
    els.defaultTemplateList.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.target.blur();
    });
    els.defaultTemplateList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-default-template-tag]");
      if (button) removeDefaultTemplateTag(button.dataset.removeDefaultTemplateTag);
    });
    els.resetDefaultTemplateBtn.addEventListener("click", resetDefaultTemplateTags);
    els.importEditedDefaultTemplateBtn.addEventListener("click", importEditedDefaultTemplateTags);
    els.addTagBtn.addEventListener("click", addCustomTag);
    els.tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addCustomTag();
    });
    els.tagGroupSelect.addEventListener("change", () => {
      state.selectedTagGroupName = els.tagGroupSelect.value || "__all";
      applyTagGroupFilter();
      saveSettings();
      renderAll();
      setStatus(`标签池来源已切换为：${getSelectedTagGroupLabel()}`);
    });
    els.tagSearch.addEventListener("input", renderTagPool);
    els.analyzeBtn.addEventListener("click", analyzeSelected);
    els.pauseBtn.addEventListener("click", pauseAnalysis);
    els.continueBtn.addEventListener("click", continueAnalysis);
    els.restartBtn.addEventListener("click", restartAnalysis);
    els.applyBtn.addEventListener("click", applyReadyResults);
    els.undoBtn.addEventListener("click", undoLastWrite);
    els.closeWindowBtn.addEventListener("click", closePluginWindow);
    els.globalPrompt.addEventListener("input", saveSettings);
    els.clearResultsBtn.addEventListener("click", () => {
      state.results = [];
      saveResultsState();
      resetAnalysisProgress();
      resetWriteProgress();
      renderResults();
    });
    els.resultFilterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.activeResultFilter = button.dataset.resultFilter || "all";
        renderResults();
      });
    });
    els.retryFailedBtn.addEventListener("click", retryFailedResults);
    els.runHealthCheckBtn.addEventListener("click", () => runHealthCheck({ silent: false }));
    els.analysisPresetSelect.addEventListener("change", () => {
      state.activePresetName = els.analysisPresetSelect.value || "";
      saveSettings();
      renderPresetHint();
    });
    els.applyPresetBtn.addEventListener("click", () => applyAnalysisPreset(els.analysisPresetSelect.value));
    els.refreshBackendStatusBtn.addEventListener("click", () => {
      refreshModelStatus();
      saveSettings();
    });
    [
      "maxTags", "concurrency", "aiRetryCount", "requestChunkK", "autoConfidence", "hideConfidence", "frameRateValue", "frameRateUnit", "maxVideoFrames",
      "maxAnimatedFrames", "skipStart", "skipEnd", "skipTagged", "previewBeforeWrite", "autoApplyHighConfidence", "allowOutOfPoolSuggestions", "writeAnnotation", "includeTitleInPrompt", "diagnosticEnabled"
    ].forEach((id) => {
      els[id].addEventListener("change", () => {
        clampAndShowFrameRate();
        saveSettings();
        refreshModelStatus();
      });
    });
  }

  async function refreshAll() {
    await Promise.all([refreshTags(), refreshModelStatus()]);
    renderAll();
  }

  async function closePluginWindow() {
    closeSettingsDrawer();
    abortCurrentAnalysis();
    try {
      const eagleWindow = getPluginWindowApi();
      await persistCollectorWindowBounds(eagleWindow);
      if (document.body.classList.contains("collector-mode")) {
        markWorkbenchRestorePending();
      }
      if (eagleWindow && typeof eagleWindow.close === "function") {
        eagleWindow.close();
        return;
      }
    } catch (error) {
      setStatus(`关闭窗口失败：${formatError(error)}`);
      return;
    }
    try {
      window.close();
    } catch (error) {
      setStatus(`关闭窗口失败：${formatError(error)}`);
    }
  }

  function getPluginWindowApi() {
    return window.eagle && (eagle.window || eagle.pluginWindow);
  }

  async function getCurrentWindowBounds(eagleWindow) {
    if (eagleWindow && typeof eagleWindow.getBounds === "function") {
      const bounds = await eagleWindow.getBounds();
      if (bounds && typeof bounds === "object") return normalizeBounds(bounds);
    }
    return {
      x: Math.max(0, window.screenX || 0),
      y: Math.max(0, window.screenY || 0),
      width: Math.max(1180, window.outerWidth || 1180),
      height: Math.max(760, window.outerHeight || 760)
    };
  }

  function normalizeBounds(bounds) {
    return {
      x: Number(bounds.x ?? bounds.left ?? 0) || 0,
      y: Number(bounds.y ?? bounds.top ?? 0) || 0,
      width: Number(bounds.width ?? COLLECTOR_WINDOW_BOUNDS.width) || COLLECTOR_WINDOW_BOUNDS.width,
      height: Number(bounds.height ?? COLLECTOR_WINDOW_BOUNDS.height) || COLLECTOR_WINDOW_BOUNDS.height
    };
  }

  function readFiniteNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function readPositiveNumber(value, fallback) {
    const next = Number(value);
    return Number.isFinite(next) && next > 0 ? next : fallback;
  }

  function getAvailableScreenBounds(fallbackBounds) {
    const screenInfo = window.screen || {};
    return {
      left: readFiniteNumber(screenInfo.availLeft, fallbackBounds.x || 0),
      top: readFiniteNumber(screenInfo.availTop, fallbackBounds.y || 0),
      width: readPositiveNumber(screenInfo.availWidth, fallbackBounds.width || COLLECTOR_WINDOW_BOUNDS.width),
      height: readPositiveNumber(screenInfo.availHeight, fallbackBounds.height || COLLECTOR_WINDOW_BOUNDS.height)
    };
  }

  function clampCollectorWindowBounds(bounds, screenBounds) {
    const maxWidth = Math.max(1, screenBounds.width - COLLECTOR_SCREEN_MARGIN * 2);
    const maxHeight = Math.max(1, screenBounds.height - COLLECTOR_SCREEN_MARGIN * 2);
    const width = Math.min(bounds.width, maxWidth);
    const height = Math.min(bounds.height, maxHeight);
    const minX = screenBounds.left + COLLECTOR_SCREEN_MARGIN;
    const maxX = screenBounds.left + screenBounds.width - width - COLLECTOR_SCREEN_MARGIN;
    const minY = screenBounds.top + COLLECTOR_SCREEN_MARGIN;
    const maxY = screenBounds.top + screenBounds.height - height - COLLECTOR_SCREEN_MARGIN;
    const x = clampNumber(bounds.x, minX, maxX);
    const y = clampNumber(bounds.y, minY, maxY);
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  function isCollectorSizedBounds(bounds) {
    return Boolean(
      bounds
      && bounds.width <= COLLECTOR_WINDOW_BOUNDS.width + COLLECTOR_RESTORE_TOLERANCE
      && bounds.height <= COLLECTOR_WINDOW_BOUNDS.height + COLLECTOR_RESTORE_TOLERANCE
    );
  }

  function getWorkbenchWindowBounds(sourceBounds = {}) {
    const screenBounds = getAvailableScreenBounds(sourceBounds);
    const useDefaultSize = isCollectorSizedBounds(sourceBounds);
    const width = useDefaultSize ? WORKBENCH_WINDOW_BOUNDS.width : readPositiveNumber(sourceBounds.width, WORKBENCH_WINDOW_BOUNDS.width);
    const height = useDefaultSize ? WORKBENCH_WINDOW_BOUNDS.height : readPositiveNumber(sourceBounds.height, WORKBENCH_WINDOW_BOUNDS.height);
    const defaultX = screenBounds.left + (screenBounds.width - width) / 2;
    const defaultY = screenBounds.top + (screenBounds.height - height) / 2;
    return clampCollectorWindowBounds({
      x: useDefaultSize ? defaultX : readFiniteNumber(sourceBounds.x, defaultX),
      y: useDefaultSize ? defaultY : readFiniteNumber(sourceBounds.y, defaultY),
      width,
      height
    }, screenBounds);
  }

  function markWorkbenchRestorePending() {
    try {
      localStorage.setItem(STORAGE_KEYS.restoreWorkbenchBounds, "1");
    } catch (error) {
      // The current bounds check on next launch is still a fallback if storage is unavailable.
    }
  }

  function consumeWorkbenchRestorePending() {
    try {
      const pending = localStorage.getItem(STORAGE_KEYS.restoreWorkbenchBounds) === "1";
      if (pending) localStorage.removeItem(STORAGE_KEYS.restoreWorkbenchBounds);
      return pending;
    } catch (error) {
      return false;
    }
  }

  function readStoredCollectorWindowBounds() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.collectorWindowBounds) || "null");
      if (!value || typeof value !== "object") return null;
      const bounds = normalizeBounds(value);
      if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
      return bounds;
    } catch (error) {
      removeStoredCollectorWindowBounds();
      return null;
    }
  }

  function saveCollectorWindowBounds(bounds) {
    try {
      const normalized = normalizeBounds(bounds);
      localStorage.setItem(STORAGE_KEYS.collectorWindowBounds, JSON.stringify({
        x: normalized.x,
        y: normalized.y,
        width: COLLECTOR_WINDOW_BOUNDS.width,
        height: COLLECTOR_WINDOW_BOUNDS.height
      }));
    } catch (error) {
      // Collector placement is a convenience; the default top position remains available.
    }
  }

  function removeStoredCollectorWindowBounds() {
    try {
      localStorage.removeItem(STORAGE_KEYS.collectorWindowBounds);
    } catch (error) {
      // Ignore storage cleanup failures.
    }
  }

  async function persistCollectorWindowBounds(eagleWindow) {
    if (!document.body.classList.contains("collector-mode")) return;
    try {
      const bounds = await getCurrentWindowBounds(eagleWindow);
      saveCollectorWindowBounds(bounds);
    } catch (error) {
      // Keep the previous saved collector position if the host cannot report bounds.
    }
  }

  async function restoreWorkbenchWindow(eagleWindow, options = {}) {
    document.body.classList.remove("collector-mode");
    if (els.collectorBar) els.collectorBar.hidden = true;
    if (!eagleWindow) return;
    if (typeof eagleWindow.setResizable === "function") await eagleWindow.setResizable(true);
    const sourceBounds = state.collectorPreviousBounds || await getCurrentWindowBounds(eagleWindow);
    await setWindowBounds(eagleWindow, getWorkbenchWindowBounds(sourceBounds));
    if (typeof eagleWindow.setAlwaysOnTop === "function") await eagleWindow.setAlwaysOnTop(state.collectorPreviousAlwaysOnTop);
    if (options.clearCollectorState !== false) state.collectorPreviousBounds = null;
  }

  async function ensureWorkbenchWindowBounds() {
    try {
      const eagleWindow = getPluginWindowApi();
      if (!eagleWindow) return;
      const bounds = await getCurrentWindowBounds(eagleWindow);
      const restorePending = consumeWorkbenchRestorePending();
      if (restorePending || isCollectorSizedBounds(bounds)) {
        await restoreWorkbenchWindow(eagleWindow, { clearCollectorState: false });
      }
    } catch (error) {
      setStatus(`恢复工作台窗口尺寸失败：${formatError(error)}`);
    }
  }

  async function getCurrentAlwaysOnTop(eagleWindow) {
    if (eagleWindow && typeof eagleWindow.isAlwaysOnTop === "function") {
      return Boolean(await eagleWindow.isAlwaysOnTop());
    }
    return false;
  }

  async function getCollectorWindowBounds(eagleWindow) {
    const current = await getCurrentWindowBounds(eagleWindow);
    const screenBounds = getAvailableScreenBounds(current);
    const storedBounds = readStoredCollectorWindowBounds();
    if (storedBounds) {
      return clampCollectorWindowBounds({
        x: storedBounds.x,
        y: storedBounds.y,
        width: COLLECTOR_WINDOW_BOUNDS.width,
        height: COLLECTOR_WINDOW_BOUNDS.height
      }, screenBounds);
    }
    const ideal = {
      x: screenBounds.left + (screenBounds.width - COLLECTOR_WINDOW_BOUNDS.width) / 2,
      y: screenBounds.top + COLLECTOR_WINDOW_BOUNDS.topOffset,
      width: COLLECTOR_WINDOW_BOUNDS.width,
      height: COLLECTOR_WINDOW_BOUNDS.height
    };
    return clampCollectorWindowBounds(ideal, screenBounds);
  }

  async function setWindowBounds(eagleWindow, bounds) {
    if (!eagleWindow || !bounds) return;
    if (typeof eagleWindow.setBounds === "function") {
      await eagleWindow.setBounds(bounds);
      return;
    }
    if (typeof eagleWindow.setSize === "function") {
      await eagleWindow.setSize(bounds.width, bounds.height);
    }
    if (typeof eagleWindow.setPosition === "function") {
      await eagleWindow.setPosition(bounds.x, bounds.y);
    }
  }

  async function enterCollectorMode() {
    closeSelectedListDialog();
    closeSettingsDrawer();
    document.body.classList.add("collector-mode");
    if (els.collectorBar) els.collectorBar.hidden = false;
    updateCollectorBar();
    try {
      const eagleWindow = getPluginWindowApi();
      if (eagleWindow && !state.collectorPreviousBounds) {
        state.collectorPreviousBounds = await getCurrentWindowBounds(eagleWindow);
        state.collectorPreviousAlwaysOnTop = await getCurrentAlwaysOnTop(eagleWindow);
      }
      if (eagleWindow && typeof eagleWindow.setResizable === "function") await eagleWindow.setResizable(false);
      if (eagleWindow && typeof eagleWindow.setAlwaysOnTop === "function") await eagleWindow.setAlwaysOnTop(true);
      await setWindowBounds(eagleWindow, await getCollectorWindowBounds(eagleWindow));
      if (eagleWindow && typeof eagleWindow.showInactive === "function") await eagleWindow.showInactive();
    } catch (error) {
      setStatus(`切换采集条失败：${formatError(error)}`);
    }
  }

  async function exitCollectorMode() {
    try {
      const eagleWindow = getPluginWindowApi();
      await persistCollectorWindowBounds(eagleWindow);
      await restoreWorkbenchWindow(eagleWindow);
    } catch (error) {
      setStatus(`展开工作台失败：${formatError(error)}`);
    }
  }

  function openWorkbenchContextMenu(event, scope) {
    event.preventDefault();
    event.stopPropagation();
    const itemRow = event.target.closest("[data-item-id]");
    const resultCard = event.target.closest("[data-result-id]");
    const poolTag = event.target.closest("[data-pool-tag]");
    const reviewTag = event.target.closest("[data-review-tag-name]");
    if (itemRow) {
      openContextMenu(event, [
        { label: "分析此素材", action: () => analyzeSingleItem(itemRow.dataset.itemId) },
        { label: "从列表移除", action: () => removeSelectedItem(itemRow.dataset.itemId) },
        { label: "复制文件路径", action: () => copyItemPath(itemRow.dataset.itemId) }
      ]);
      return;
    }
    if (reviewTag) {
      openContextMenu(event, [
        { label: "移除此标签", action: () => removeReviewTag(reviewTag.dataset.resultId, reviewTag.dataset.reviewTagName) },
        { label: "复制标签名", action: () => copyText(reviewTag.dataset.reviewTagName) }
      ]);
      return;
    }
    if (resultCard) {
      const resultId = resultCard.dataset.resultId;
      const result = state.results.find((item) => item.id === resultId);
      openContextMenu(event, [
        { label: "重新分析", action: () => reanalyzeResult(resultId), disabled: state.running },
        { label: "写入此项标签", action: () => applySingleResult(resultId), disabled: !canWriteReadyResults() || !result || result.status !== "ready" || !getSelectedReviewTags(result).length },
        { label: "复制推荐标签", action: () => copyResultTags(resultId), disabled: !result || !getSelectedReviewTags(result).length },
        { label: "从结果中移除", action: () => removeResult(resultId) }
      ]);
      return;
    }
    if (poolTag) {
      openContextMenu(event, [
        { label: "复制标签名", action: () => copyText(poolTag.dataset.poolTag) },
        { label: "从本次标签池移除", action: () => removeFromPool(poolTag.dataset.poolTag) }
      ]);
      return;
    }
    if (scope === "tag-pool") return;
    openContextMenu(event, [
      { label: "追加当前选中", action: () => appendSelectedItems("右键菜单追加当前选中") },
      { label: "替换为当前选中", action: () => replaceSelectedItems("右键菜单替换当前选中") },
      { label: "清空待分析素材", action: () => clearSelectedQueue() },
      { label: "展开素材", action: openSelectedListDialog, disabled: !state.selectedItems.length },
      { label: "进入置顶采集", action: enterCollectorMode }
    ]);
  }

  function openContextMenu(event, items) {
    const availableItems = items.filter((item) => !item.hidden);
    const nativeMenu = window.eagle && eagle.contextMenu && eagle.contextMenu.open;
    if (typeof nativeMenu === "function") {
      nativeMenu.call(eagle.contextMenu, availableItems.map((item) => ({
        label: item.label,
        disabled: Boolean(item.disabled),
        enabled: !item.disabled,
        click: item.disabled ? undefined : item.action
      })));
      return;
    }
    showFallbackContextMenu(event, availableItems);
  }

  function showFallbackContextMenu(event, items) {
    closeFallbackContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 40)}px`;
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        closeFallbackContextMenu();
        if (!item.disabled) item.action();
      });
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    window.setTimeout(() => {
      document.addEventListener("click", closeFallbackContextMenu, { once: true });
    }, 0);
  }

  function closeFallbackContextMenu() {
    document.querySelectorAll(".context-menu").forEach((menu) => menu.remove());
  }

  async function analyzeSingleItem(itemId) {
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === itemId);
    if (!item) {
      setStatus("找不到这个素材，请重新导入当前选中素材后再试。");
      return;
    }
    state.results = state.results.filter((result) => result.id !== itemId);
    state.results.push(createPendingResult(item));
    saveResultsState();
    renderAll();
    await analyzeSelected();
  }

  function removeSelectedItem(itemId) {
    state.selectedItems = state.selectedItems.filter((item) => getItemId(item) !== itemId);
    state.results = state.results.filter((result) => result.id !== itemId);
    syncMediaPreviewAfterSelectedItemsChange();
    saveResultsState();
    renderAll();
    setStatus("已从待分析列表移除 1 个素材。");
  }

  function removeResult(resultId) {
    state.results = state.results.filter((result) => result.id !== resultId);
    saveResultsState();
    resetAnalysisProgress();
    renderAll();
    setStatus("已从结果中移除 1 项。");
  }

  async function applySingleResult(resultId) {
    if (!canWriteReadyResults()) return;
    const result = state.results.find((item) => item.id === resultId);
    const selectedTags = result ? getSelectedReviewTags(result) : [];
    if (!result || result.status !== "ready" || !selectedTags.length) {
      setStatus("这个结果没有可写入的标签。");
      return;
    }
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === resultId);
    if (!item || item.external || typeof item.save !== "function") {
      updateResult(resultId, { status: "ready", message: "找不到可写回的 Eagle 素材", errorType: "write" });
      return;
    }
    state.writing = true;
    updateWriteProgress(0, 1, 0);
    setControlsBusy(state.running);
    renderResults();
    try {
      const settings = readSettings();
      await mergeTagsIntoItem(item, selectedTags.map((tag) => tag.name), settings.writeAnnotation ? result.aiReason : "", "右键菜单写入标签");
      updateResult(resultId, { status: "applied", message: "已写入 Eagle", errorType: "" });
      updateWriteProgress(1, 1, 0, "已写入 1 个素材。");
      setStatus("已写入 1 个素材。");
    } catch (error) {
      updateResult(resultId, { status: "ready", message: `写入失败：${formatError(error)}`, errorType: "write" });
      updateWriteProgress(1, 1, 1, "写入失败 1 个素材。");
    } finally {
      state.writing = false;
      setControlsBusy(state.running);
      renderAll();
    }
  }

  function copyItemPath(itemId) {
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === itemId);
    copyText(getItemFilePath(item));
  }

  function copyResultTags(resultId) {
    const result = state.results.find((item) => item.id === resultId);
    copyText(getSelectedReviewTags(result || {}).map((tag) => tag.name).join("、"));
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      setStatus("已复制到剪贴板。");
    } catch (error) {
      setStatus(`复制失败：${formatError(error)}`);
    }
  }

  function openSelectedListDialog() {
    if (!els.selectedListDialog || !els.selectedListOverlay) return;
    renderSelectedFullList();
    els.selectedListOverlay.hidden = false;
    els.selectedListDialog.hidden = false;
    requestAnimationFrame(() => {
      els.selectedListOverlay.classList.add("is-open");
      els.selectedListDialog.classList.add("is-open");
      els.selectedListDialog.setAttribute("aria-hidden", "false");
    });
  }

  function closeSelectedListDialog() {
    if (!els.selectedListDialog || !els.selectedListOverlay || els.selectedListOverlay.hidden) return;
    els.selectedListOverlay.classList.remove("is-open");
    els.selectedListDialog.classList.remove("is-open");
    els.selectedListDialog.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!els.selectedListOverlay.classList.contains("is-open")) {
        els.selectedListOverlay.hidden = true;
        els.selectedListDialog.hidden = true;
      }
    }, 180);
  }

  function handleMediaPreviewClick(event) {
    const removeButton = event.target.closest("[data-remove-selected-item]");
    if (removeButton) {
      event.preventDefault();
      event.stopPropagation();
      removeSelectedItem(removeButton.dataset.removeSelectedItem);
      return;
    }
    const itemButton = event.target.closest("[data-preview-item]");
    if (itemButton) {
      event.preventDefault();
      event.stopPropagation();
      openMediaPreview({ itemId: itemButton.dataset.previewItem });
      return;
    }
    const resultButton = event.target.closest("[data-preview-result]");
    if (resultButton) {
      event.preventDefault();
      event.stopPropagation();
      openMediaPreview({ resultId: resultButton.dataset.previewResult });
    }
  }

  function openMediaPreview({ itemId = "", resultId = "" } = {}) {
    const resolvedItemId = itemId || resultId;
    const order = resultId
      ? getFilteredResults().map((result) => result.id)
      : state.selectedItems.map(getItemId);
    state.mediaPreview = {
      open: true,
      itemId: resolvedItemId,
      resultId,
      order: order.length ? order : [resolvedItemId].filter(Boolean)
    };
    if (els.mediaPreviewOverlay) els.mediaPreviewOverlay.hidden = false;
    if (els.mediaPreviewDialog) els.mediaPreviewDialog.hidden = false;
    renderMediaPreview();
    requestAnimationFrame(() => {
      els.mediaPreviewOverlay.classList.add("is-open");
      els.mediaPreviewDialog.classList.add("is-open");
      els.mediaPreviewDialog.setAttribute("aria-hidden", "false");
    });
  }

  function closeMediaPreview() {
    if (!els.mediaPreviewDialog || !els.mediaPreviewOverlay || els.mediaPreviewOverlay.hidden) return;
    els.mediaPreviewOverlay.classList.remove("is-open");
    els.mediaPreviewDialog.classList.remove("is-open");
    els.mediaPreviewDialog.setAttribute("aria-hidden", "true");
    state.mediaPreview.open = false;
    if (els.mediaPreviewBody) els.mediaPreviewBody.innerHTML = "";
    window.setTimeout(() => {
      if (!els.mediaPreviewOverlay.classList.contains("is-open")) {
        els.mediaPreviewOverlay.hidden = true;
        els.mediaPreviewDialog.hidden = true;
      }
    }, 180);
  }

  function navigateMediaPreview(delta) {
    const order = Array.isArray(state.mediaPreview.order) ? state.mediaPreview.order.filter(Boolean) : [];
    if (!order.length) return;
    const currentId = state.mediaPreview.resultId || state.mediaPreview.itemId;
    const currentIndex = Math.max(0, order.indexOf(currentId));
    const nextIndex = (currentIndex + delta + order.length) % order.length;
    const nextId = order[nextIndex];
    if (state.mediaPreview.resultId) {
      openMediaPreview({ resultId: nextId });
    } else {
      openMediaPreview({ itemId: nextId });
    }
  }

  function buildMediaPreviewModel({ itemId = "", resultId = "" } = {}) {
    const resolvedId = itemId || resultId;
    const result = state.results.find((candidate) => candidate.id === (resultId || resolvedId)) || null;
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === resolvedId) || null;
    const sourcePath = getItemFilePath(item || {}) || (result && result.diagnostics && result.diagnostics.sourcePath) || "";
    const previewPath = getItemPreviewPath(item || {}) || (result && result.diagnostics && result.diagnostics.previewPath) || "";
    const sourceExt = getMediaExt(item || result || {}, sourcePath || result && result.name || "");
    const previewExt = getMediaExt({}, previewPath);
    const firstDiagnosticUrl = getFirstDiagnosticImageUrl(result && result.diagnostics);
    let kind = "unknown";
    let mediaPath = "";
    if (sourcePath && VIDEO_EXTS.has(sourceExt)) {
      kind = "video";
      mediaPath = sourcePath;
    } else if (sourcePath && isPreviewableImageExt(sourceExt)) {
      kind = "image";
      mediaPath = sourcePath;
    } else if (previewPath && isPreviewableImageExt(previewExt)) {
      kind = "image";
      mediaPath = previewPath;
    }
    const fallbackPath = previewPath && previewPath !== mediaPath ? previewPath : "";
    return {
      item,
      result,
      itemId: resolvedId,
      resultId: result ? result.id : "",
      name: result && result.name ? result.name : item ? getItemName(item) : "未命名素材",
      kind,
      sourcePath: mediaPath,
      originalPath: sourcePath,
      previewPath,
      sourceUrl: mediaPath ? toFileUrl(mediaPath) : "",
      fallbackUrl: fallbackPath ? toFileUrl(fallbackPath) : firstDiagnosticUrl,
      firstDiagnosticUrl,
      tags: result && Array.isArray(result.reviewTags) ? result.reviewTags : [],
      reason: result && result.aiReason ? result.aiReason : "",
      status: result ? stateLabel(result.status) : "待分析",
      backend: result && result.aiBackend ? formatBackendLabel(result.aiBackend) : "",
      confidence: result && typeof result.confidence === "number" ? formatConfidence(result.confidence) : ""
    };
  }

  function renderMediaPreview() {
    if (!state.mediaPreview.open || !els.mediaPreviewDialog) return;
    const model = buildMediaPreviewModel(state.mediaPreview);
    renderMediaPreviewDetails(model);
    renderMediaPreviewPlayer(model);
  }

  function refreshMediaPreviewReview() {
    if (!state.mediaPreview.open || !els.mediaPreviewDialog) return;
    const model = buildMediaPreviewModel(state.mediaPreview);
    renderMediaPreviewDetails(model, { updatePlaybackStatus: false });
  }

  function renderMediaPreviewDetails(model, { updatePlaybackStatus = true } = {}) {
    els.mediaPreviewTitle.textContent = model.name;
    els.mediaPreviewTitle.title = model.name;
    const previewMeta = [model.status, model.backend, model.confidence, shortPath(model.originalPath || model.previewPath)]
      .filter(Boolean)
      .join(" · ");
    els.mediaPreviewMeta.textContent = previewMeta;
    els.mediaPreviewMeta.title = [model.status, model.backend, model.confidence, model.originalPath || model.previewPath]
      .filter(Boolean)
      .join(" · ");
    if (updatePlaybackStatus) {
      els.mediaPreviewStatus.textContent = model.kind === "video"
        ? "插件内自动播放视频；如果编码不支持，可用 Eagle 打开。"
        : model.kind === "image"
          ? "插件内预览图片。"
          : "没有可直接预览的本地媒体，可尝试用 Eagle 打开。";
    }
    els.mediaPreviewTags.innerHTML = renderMediaPreviewTags(model);
    bindMediaPreviewTagEvents();
    els.mediaPreviewReason.innerHTML = model.reason ? `AI 说明：${escapeHtml(model.reason)}` : "";
    els.mediaPreviewOpenEagleBtn.disabled = !model.itemId;
    const orderCount = state.mediaPreview.order.length;
    els.mediaPreviewPrevBtn.disabled = orderCount < 2;
    els.mediaPreviewNextBtn.disabled = orderCount < 2;
  }

  function renderMediaPreviewPlayer(model) {
    if (model.kind === "video" && model.sourceUrl) {
      els.mediaPreviewBody.innerHTML = `<video controls autoplay muted playsinline loop preload="auto" src="${escapeHtml(model.sourceUrl)}"></video>`;
      const video = els.mediaPreviewBody.querySelector("video");
      if (video) {
        video.addEventListener("error", () => handleMediaPreviewVideoError(model), { once: true });
        const playAttempt = video.play();
        if (playAttempt && typeof playAttempt.catch === "function") playAttempt.catch(() => {});
      }
    } else if (model.kind === "image" && model.sourceUrl) {
      els.mediaPreviewBody.innerHTML = `<img src="${escapeHtml(model.sourceUrl)}" alt="${escapeHtml(model.name)}">`;
    } else if (model.fallbackUrl) {
      els.mediaPreviewBody.innerHTML = `<img src="${escapeHtml(model.fallbackUrl)}" alt="${escapeHtml(model.name)}">`;
    } else {
      els.mediaPreviewBody.innerHTML = `<div class="media-preview-empty">这个素材没有可直接读取的预览路径。可以用 Eagle 打开，或重新导入素材后再试。</div>`;
    }
  }

  function renderMediaPreviewTags(model) {
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const tagHtml = tags.length ? tags.map((tag) => `
      <span class="${escapeHtml(reviewTagClassName(tag))}">
        <input type="checkbox" data-preview-result-id="${escapeHtml(model.resultId)}" data-preview-review-tag="${escapeHtml(tag.name)}" ${tag.selected ? "checked" : ""}>
        <span>${escapeHtml(tag.name)}</span>
        ${renderReviewTagSourceBadge(tag)}
        <strong>${escapeHtml(reviewTagMetaText(tag))}</strong>
        <button class="review-tag-remove" type="button" data-preview-result-id="${escapeHtml(model.resultId)}" data-preview-remove-review-tag="${escapeHtml(tag.name)}" title="删除标签">×</button>
      </span>
    `).join("") : `<div class="media-preview-empty">还没有待确认标签。</div>`;
    return `${tagHtml}${renderMediaPreviewTagEditor(model)}`;
  }

  function renderMediaPreviewTagEditor(model) {
    if (!model.resultId) return "";
    const menuId = `preview-manual-tag-menu-${safeDomId(model.resultId)}`;
    return `
      <div class="media-preview-tag-editor">
        <input type="search" data-preview-manual-tag-input="${escapeHtml(model.resultId)}" aria-controls="${escapeHtml(menuId)}" aria-expanded="false" autocomplete="off" placeholder="搜索或输入标签">
        <button type="button" data-preview-add-manual-tag="${escapeHtml(model.resultId)}">添加标签</button>
        <div id="${escapeHtml(menuId)}" class="manual-tag-menu" data-preview-manual-tag-menu="${escapeHtml(model.resultId)}" hidden></div>
      </div>
    `;
  }

  function bindMediaPreviewTagEvents() {
    els.mediaPreviewTags.querySelectorAll("[data-preview-review-tag]").forEach((input) => {
      input.addEventListener("change", () => toggleReviewTag(input.dataset.previewResultId, input.dataset.previewReviewTag, input.checked));
    });
    els.mediaPreviewTags.querySelectorAll("[data-preview-remove-review-tag]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeReviewTag(button.dataset.previewResultId, button.dataset.previewRemoveReviewTag);
      });
    });
    els.mediaPreviewTags.querySelectorAll("[data-preview-add-manual-tag]").forEach((button) => {
      button.addEventListener("click", () => addPreviewManualTagToResult(button.dataset.previewAddManualTag));
    });
    els.mediaPreviewTags.querySelectorAll("[data-preview-manual-tag-input]").forEach((input) => {
      input.addEventListener("focus", () => updatePreviewManualTagMenu(input.dataset.previewManualTagInput));
      input.addEventListener("input", () => updatePreviewManualTagMenu(input.dataset.previewManualTagInput));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addPreviewManualTagToResult(input.dataset.previewManualTagInput);
        }
        if (event.key === "Escape") closePreviewManualTagMenus();
      });
    });
    els.mediaPreviewTags.querySelectorAll("[data-preview-manual-tag-menu]").forEach((menu) => {
      menu.addEventListener("mousedown", (event) => {
        const option = event.target.closest("[data-manual-tag-option]");
        if (!option) return;
        event.preventDefault();
        addPreviewManualTagToResult(menu.dataset.previewManualTagMenu, option.dataset.manualTagOption);
      });
    });
  }

  function handleMediaPreviewVideoError(model) {
    const fallbackUrl = model.fallbackUrl || model.firstDiagnosticUrl;
    if (fallbackUrl) {
      els.mediaPreviewBody.innerHTML = `<img src="${escapeHtml(fallbackUrl)}" alt="${escapeHtml(model.name)}">`;
      els.mediaPreviewStatus.textContent = "插件内视频播放失败，已改为显示缩略图或诊断帧；完整播放请用 Eagle 打开。";
      return;
    }
    els.mediaPreviewBody.innerHTML = `<div class="media-preview-empty">插件内视频播放失败，也没有可用缩略图。请用 Eagle 打开。</div>`;
    els.mediaPreviewStatus.textContent = "插件内视频播放失败，请用 Eagle 打开。";
  }

  async function openPreviewInEagle() {
    const model = buildMediaPreviewModel(state.mediaPreview);
    try {
      if (model.item && typeof model.item.open === "function") {
        await model.item.open({ window: true });
      } else if (window.eagle && eagle.item && typeof eagle.item.open === "function" && model.itemId) {
        await eagle.item.open(model.itemId, { window: true });
      } else {
        setStatus("当前 Eagle 版本或素材对象不支持直接打开预览。");
        return;
      }
      setStatus("已交给 Eagle 打开素材预览。");
    } catch (error) {
      setStatus(`Eagle 打开预览失败：${formatError(error)}`);
    }
  }

  function getFirstDiagnosticImageUrl(diagnostics) {
    if (!diagnostics || !Array.isArray(diagnostics.images)) return "";
    const image = diagnostics.images.find((candidate) => candidate && candidate.exists && (candidate.previewUrl || candidate.url));
    return image ? image.previewUrl || image.url : "";
  }

  function isPreviewableImageExt(ext) {
    const normalized = String(ext || "").toLowerCase();
    return STATIC_IMAGE_EXTS.has(normalized) || ANIMATED_EXTS.has(normalized) || normalized === WEBP_EXT || normalized === "svg";
  }

  function getMediaExt(item, filePath) {
    const ext = getItemExt(item || {}, filePath);
    if (ext) return ext;
    return path && filePath ? path.extname(filePath).slice(1).toLowerCase() : "";
  }

  async function refreshTags() {
    if (!window.eagle || !eagle.tag || !eagle.tag.get) {
      state.eagleTagRecords = [];
      state.eagleTags = [];
      state.eagleTagGroups = [];
      setStatus("未检测到 Eagle 标签 API，请在 Eagle 插件窗口中运行。");
      return;
    }
    try {
      const tags = await eagle.tag.get();
      state.eagleTagRecords = Array.isArray(tags) ? tags : [];
      state.eagleTagGroups = await readEagleTagGroups();
      applyTagGroupFilter();
      state.customAllowedTags = [];
      state.disabledTags = [];
      state.sessionRemovedTags = [];
      saveStoredTagState();
      setStatus(`已从 ${getSelectedTagGroupLabel()} 读取 ${state.eagleTags.length} 个 Eagle 标签`);
    } catch (error) {
      setStatus(`读取 Eagle 标签失败：${formatError(error)}`);
    }
    renderAll();
  }

  async function readEagleTagGroups() {
    const api = window.eagle && (eagle.tagGroup || eagle.tagGroups);
    if (!api || typeof api.get !== "function") return [];
    try {
      const groups = await api.get();
      return Array.isArray(groups) ? groups : [];
    } catch (error) {
      setStatus(`读取 Eagle 标签组失败，将使用全部标签：${formatError(error)}`);
      return [];
    }
  }

  function applyTagGroupFilter() {
    const selectedName = state.selectedTagGroupName || "__all";
    if (selectedName === "__all") {
      state.eagleTags = normalizeTagList(state.eagleTagRecords.map(extractTagName));
      return;
    }
    const selectedGroup = state.eagleTagGroups.find((group) => getTagGroupName(group) === selectedName);
    if (selectedGroup && Array.isArray(selectedGroup.tags)) {
      state.eagleTags = normalizeTagList(selectedGroup.tags.map(extractTagName));
      return;
    }
    state.selectedTagGroupName = "__all";
    state.eagleTags = normalizeTagList(state.eagleTagRecords.map(extractTagName));
  }

  function getSelectedTagGroupLabel() {
    if (!state.selectedTagGroupName || state.selectedTagGroupName === "__all") return "全部 Eagle 标签";
    return `标签组「${state.selectedTagGroupName}」`;
  }

  async function refreshSelection() {
    await replaceSelectedItems("刷新当前选中");
  }

  async function fetchEagleSelectedItems() {
    if (!window.eagle || !eagle.item) {
      throw new Error("未检测到 Eagle 项目 API，请在 Eagle 插件窗口中运行。");
    }
    if (typeof eagle.item.getSelected === "function") {
      return await eagle.item.getSelected();
    }
    if (typeof eagle.item.get === "function") {
      return await eagle.item.get({ isSelected: true });
    }
    return [];
  }

  function getQueueKey(item) {
    const id = getItemId(item);
    if (id) return `id:${id}`;
    const filePath = getItemFilePath(item);
    return filePath ? `path:${filePath}` : `name:${getItemName(item)}`;
  }

  function mergeSelectedItems(nextItems, mode) {
    const incoming = Array.isArray(nextItems) ? nextItems.filter(Boolean) : [];
    const replacing = mode === "replace";
    if (replacing) {
      state.selectedItems = [];
      state.results = [];
      resetAnalysisProgress();
      resetWriteProgress();
    }
    const seen = new Set(state.selectedItems.map(getQueueKey));
    const addedItems = [];
    let skipped = 0;
    incoming.forEach((item) => {
      const key = getQueueKey(item);
      if (seen.has(key)) {
        skipped += 1;
        return;
      }
      seen.add(key);
      addedItems.push(item);
    });
    state.selectedItems = [...state.selectedItems, ...addedItems];
    state.itemSource = "eagle";
    if (!replacing && addedItems.length && state.results.length) {
      syncPendingResultsForSelectedItems({ message: "新增素材，等待分析" });
    }
    saveResultsState();
    renderAll();
    return { added: addedItems.length, skipped, total: incoming.length };
  }

  function syncPendingResultsForSelectedItems(options = {}) {
    const existingIds = new Set(state.results.map((result) => result.id));
    const missingResults = state.selectedItems
      .filter((item) => {
        const id = getItemId(item);
        return id && !existingIds.has(id);
      })
      .map((item) => ({
        ...createPendingResult(item),
        message: options.message || "等待分析"
      }));
    if (!missingResults.length) return 0;
    state.results = [...state.results, ...missingResults];
    saveResultsState();
    return missingResults.length;
  }

  async function appendSelectedItems(actionName, options = {}) {
    try {
      const nextItems = await fetchEagleSelectedItems();
      const summary = mergeSelectedItems(nextItems, "append");
      if (!summary.total && !options.silentWhenEmpty) {
        setStatus("没有读取到 Eagle 当前选中素材。");
      } else if (summary.added) {
        setStatus(`${actionName}：新增 ${summary.added} 个，跳过已存在 ${summary.skipped} 个。`);
      } else if (summary.total && !options.silentWhenEmpty) {
        setStatus("当前选中素材已在待分析列表中。");
      }
    } catch (error) {
      setStatus(`读取选中素材失败：${formatError(error)}`);
      renderAll();
    }
  }

  async function replaceSelectedItems(actionName) {
    try {
      const nextItems = await fetchEagleSelectedItems();
      if (!nextItems.length) {
        setStatus("没有读取到 Eagle 当前选中素材，待分析列表保持不变。");
        return;
      }
      const summary = mergeSelectedItems(nextItems, "replace");
      setStatus(`${actionName}：已导入 ${summary.added} 个 Eagle 选中素材。`);
    } catch (error) {
      setStatus(`读取选中素材失败：${formatError(error)}，待分析列表保持不变。`);
      renderAll();
    }
  }

  function clearSelectedQueue(options = {}) {
    if (state.running || state.writing) {
      setStatus("正在分析或写入，不能清空待分析素材。");
      return;
    }
    const hasContent = state.selectedItems.length || state.results.length;
    if (!hasContent) {
      setStatus("待分析素材已经是空的。");
      return;
    }
    if (!options.skipConfirm && typeof window.confirm === "function" && !window.confirm("清空待分析素材和当前分析结果？")) {
      return;
    }
    closeSelectedListDialog();
    state.selectedItems = [];
    state.results = [];
    syncMediaPreviewAfterSelectedItemsChange();
    resetAnalysisProgress();
    resetWriteProgress();
    saveResultsState();
    renderAll();
    setStatus("已清空待分析素材和当前分析结果。");
  }

  async function refreshModelStatus() {
    try {
      const model = getAiModel();
      if (els.modelStatus) els.modelStatus.textContent = model ? t("model.configured") : t("model.notConfigured");
      if (els.backendStatus) {
        els.backendStatus.textContent = model ? t("model.eagleVisionConfigured") : t("model.noDefaultVision");
      }
    } catch (error) {
      if (els.modelStatus) els.modelStatus.textContent = t("model.sdkUnavailable");
      if (els.backendStatus) els.backendStatus.textContent = t("model.statusFailed");
    }
  }

  function getAiModel() {
    const ai = window.eagle && eagle.extraModule && eagle.extraModule.ai;
    if (!ai || !ai.getDefaultModel || !ai.getModel) return null;
    if (typeof ai.reload === "function") ai.reload();
    const modelId = ai.getDefaultModel("image");
    return modelId ? ai.getModel(modelId) : null;
  }

  function openSettingsDrawer() {
    if (!els.settingsDrawer || !els.settingsOverlay) return;
    els.settingsOverlay.hidden = false;
    requestAnimationFrame(() => {
      els.settingsOverlay.classList.add("is-open");
      els.settingsDrawer.classList.add("is-open");
      els.settingsDrawer.setAttribute("aria-hidden", "false");
    });
  }

  function closeSettingsDrawer() {
    if (!els.settingsDrawer || !els.settingsOverlay || els.settingsOverlay.hidden) return;
    els.settingsOverlay.classList.remove("is-open");
    els.settingsDrawer.classList.remove("is-open");
    els.settingsDrawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!els.settingsOverlay.classList.contains("is-open")) {
        els.settingsOverlay.hidden = true;
      }
    }, 180);
  }

  function activateSettingsTab(tabName) {
    const nextTab = tabName || "backend";
    els.settingsTabs.forEach((tab) => {
      const active = tab.dataset.settingsTab === nextTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.settingsPanels.forEach((panel) => {
      const active = panel.dataset.settingsPanel === nextTab;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  function openAiSettings() {
    const ai = window.eagle && eagle.extraModule && eagle.extraModule.ai;
    if (ai && typeof ai.open === "function") {
      ai.open();
    } else {
      setStatus("当前 Eagle 版本未提供 AI 设置入口。");
    }
  }

  function getUsableBackends(settings, eagleModel) {
    return eagleModel ? ["eagle"] : [];
  }

  function formatBackendLabel(backend) {
    if (backend === "eagle") return "Eagle AI";
    return String(backend || "未知模型");
  }

  async function importSelectedItems() {
    await appendSelectedItems("追加当前选中");
  }

  function importDefaultTags() {
    state.customAllowedTags = normalizeTagList([...state.customAllowedTags, ...getDefaultTemplateTags()]);
    state.disabledTags = state.disabledTags.filter((tag) => !getDefaultTemplateTags().includes(tag));
    state.sessionRemovedTags = state.sessionRemovedTags.filter((tag) => !getDefaultTemplateTags().includes(tag));
    saveStoredTagState();
    renderAll();
    setStatus("已导入当前默认特效标签模板。");
  }

  function importEditedDefaultTemplateTags() {
    importDefaultTags();
    closeDefaultTemplateDialog();
  }

  function openDefaultTemplateDialog() {
    renderDefaultTemplateList();
    els.defaultTemplateOverlay.hidden = false;
    els.defaultTemplateDialog.hidden = false;
    window.setTimeout(() => {
      els.defaultTemplateOverlay.classList.add("is-open");
      els.defaultTemplateDialog.classList.add("is-open");
      els.defaultTemplateDialog.setAttribute("aria-hidden", "false");
      els.defaultTemplateSearch.focus();
    }, 0);
  }

  function closeDefaultTemplateDialog() {
    if (!els.defaultTemplateDialog || els.defaultTemplateDialog.hidden) return;
    els.defaultTemplateOverlay.classList.remove("is-open");
    els.defaultTemplateDialog.classList.remove("is-open");
    els.defaultTemplateDialog.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!els.defaultTemplateDialog.classList.contains("is-open")) {
        els.defaultTemplateOverlay.hidden = true;
        els.defaultTemplateDialog.hidden = true;
      }
    }, 160);
  }

  function renderDefaultTemplateList() {
    if (!els.defaultTemplateList) return;
    const query = cleanTag(els.defaultTemplateSearch.value).toLowerCase();
    const tags = getDefaultTemplateTags().filter((tag) => !query || tag.toLowerCase().includes(query));
    els.defaultTemplateList.innerHTML = "";
    if (!tags.length) {
      els.defaultTemplateList.innerHTML = `<div class="empty">模板里没有匹配标签。</div>`;
      return;
    }
    tags.forEach((tag) => {
      const row = document.createElement("div");
      row.className = "default-template-row";
      row.innerHTML = `
        <input type="text" value="${escapeHtml(tag)}" data-default-template-rename="${escapeHtml(tag)}" aria-label="编辑模板标签 ${escapeHtml(tag)}">
        <button type="button" data-remove-default-template-tag="${escapeHtml(tag)}">删除</button>
      `;
      els.defaultTemplateList.appendChild(row);
    });
  }

  function addDefaultTemplateTag() {
    const tag = cleanTag(els.defaultTemplateInput.value);
    if (!tag) return;
    state.defaultTemplateTags = normalizeTagList([...state.defaultTemplateTags, tag]);
    els.defaultTemplateInput.value = "";
    saveDefaultTemplateTags();
    renderDefaultTemplateList();
    setStatus(`已加入默认模板：${tag}`);
  }

  function renameDefaultTemplateTag(oldTag, nextValue) {
    const oldName = cleanTag(oldTag);
    const nextName = cleanTag(nextValue);
    if (!oldName || !nextName || oldName === nextName) {
      renderDefaultTemplateList();
      return;
    }
    state.defaultTemplateTags = normalizeTagList(state.defaultTemplateTags.map((tag) => tag === oldName ? nextName : tag));
    saveDefaultTemplateTags();
    renderDefaultTemplateList();
    setStatus(`已更新默认模板标签：${oldName} -> ${nextName}`);
  }

  function removeDefaultTemplateTag(tagName) {
    const tag = cleanTag(tagName);
    if (!tag) return;
    state.defaultTemplateTags = state.defaultTemplateTags.filter((item) => item !== tag);
    saveDefaultTemplateTags();
    renderDefaultTemplateList();
    setStatus(`已从默认模板删除：${tag}`);
  }

  function resetDefaultTemplateTags() {
    if (typeof window.confirm === "function" && !window.confirm("重置默认模板为内置版本？")) return;
    state.defaultTemplateTags = normalizeTagList(DEFAULT_VFX_TAGS);
    saveDefaultTemplateTags();
    renderDefaultTemplateList();
    setStatus("默认模板已重置为内置版本。");
  }

  function addCustomTag() {
    const tag = cleanTag(els.tagInput.value);
    if (!tag) return;
    state.customAllowedTags = normalizeTagList([...state.customAllowedTags, tag]);
    state.disabledTags = state.disabledTags.filter((item) => item !== tag);
    state.sessionRemovedTags = state.sessionRemovedTags.filter((item) => item !== tag);
    els.tagInput.value = "";
    saveStoredTagState();
    renderAll();
  }

  function removeFromPool(tag) {
    if (!state.sessionRemovedTags.includes(tag)) {
      state.sessionRemovedTags.push(tag);
    }
    renderAll();
  }

  async function analyzeSelected() {
    if (state.running) return;
    const settings = readSettings();
    const baseAllowedTags = getAllowedTags();
    const allowedTags = getAnalysisAllowedTags(baseAllowedTags, settings);
    if (!allowedTags.length) {
      setStatus("标签池为空，请先刷新 Eagle 标签或导入默认模板。");
      return;
    }
    if (!state.selectedItems.length) {
      setStatus("请先在 Eagle 中选择要分析的素材。");
      return;
    }
    const model = getAiModel();
    if (!await ensureHealthyBeforeAnalysis(settings, model)) return;
    const usableBackends = getUsableBackends(settings, model);
    if (!usableBackends.length) {
      setStatus("没有可用 AI 模型：请先配置 Eagle 默认视觉模型。");
      return;
    }
    settings.enabledBackends = usableBackends;
    if (!ensureDiagnosticSettings(settings)) return;
    if (state.results.length) syncPendingResultsForSelectedItems({ message: "新增素材，等待分析" });
    const existingResults = new Map(state.results.map((result) => [result.id, result]));
    const hasPendingResults = state.results.some((result) => result.status === "pending");
    const itemsToAnalyze = hasPendingResults
      ? state.selectedItems.filter((item) => {
        const result = existingResults.get(getItemId(item));
        return result && result.status === "pending";
      })
      : state.selectedItems;
    if (!itemsToAnalyze.length) {
      setStatus("没有待分析的素材。如需重跑单个素材，请点击结果里的“重新分析”。");
      return;
    }
    state.running = true;
    state.pauseRequested = false;
    state.paused = false;
    state.analysisAbortController = createAnalysisAbortController();
    let processed = 0;
    updateAnalysisProgress(processed, itemsToAnalyze.length, itemsToAnalyze[0], { stage: "准备队列", itemProgress: 0.02 });
    if (!hasPendingResults) {
      state.results = state.selectedItems.map((item) => createPendingResult(item));
      resetWriteProgress();
      saveResultsState();
    }
    renderAll();
    setControlsBusy(true);

    try {
      await runWithConcurrency(itemsToAnalyze, settings.concurrency, async (item) => {
        const current = state.results.find((result) => result.id === getItemId(item));
        let lastStage = "";
        const reportStage = (stage, itemProgress) => {
          updateAnalysisProgress(processed, itemsToAnalyze.length, item, { stage, itemProgress: Math.min(itemProgress, 0.95) });
          if (current && stage && stage !== lastStage) {
            lastStage = stage;
            updateResult(current.id, { message: `分析中：${stage}` });
          }
        };
        try {
          if (!current) return;
          updateAnalysisProgress(processed, itemsToAnalyze.length, item, { stage: "准备素材", itemProgress: 0.04 });
          updateResult(current.id, { status: "running", message: "分析中" });
          if (settings.skipTagged && Array.isArray(item.tags) && item.tags.length) {
            updateResult(current.id, { status: "skipped", message: "已有标签，已跳过" });
            return;
          }
          const result = await analyzeItem(item, model, allowedTags, settings, reportStage);
          updateResult(current.id, result);
        } catch (error) {
          if (state.pauseRequested && isAnalysisAbortError(error)) {
            updateResult(current.id, {
              status: "pending",
              message: "已暂停，等待继续",
              errorType: "",
              tags: [],
              reviewTags: [],
              autoTags: [],
              filteredTags: []
            });
          } else {
            updateResult(current.id, {
              status: "failed",
              message: formatError(error),
              errorType: classifyError(error),
              diagnosticPath: error && error.diagnosticPath ? error.diagnosticPath : current.diagnosticPath,
              diagnostics: error && error.diagnostics ? error.diagnostics : current.diagnostics,
              tags: [],
              reviewTags: [],
              autoTags: [],
              filteredTags: []
            });
          }
        } finally {
          processed += 1;
          updateAnalysisProgress(processed, itemsToAnalyze.length, item, { stage: "完成", itemProgress: 1 });
        }
      });
    } finally {
      const paused = state.pauseRequested;
      state.running = false;
      state.analysisAbortController = null;
      state.pauseRequested = false;
      state.paused = paused && state.results.some((result) => result.status === "pending");
      setControlsBusy(false);
      renderAll();
      setStatus(state.paused ? "已暂停。点击“继续”处理剩余素材，或点击“重新开始”重跑当前批次。" : "分析完成。");
    }
  }

  function pauseAnalysis() {
    if (!state.running) return;
    state.pauseRequested = true;
    els.pauseBtn.disabled = true;
    renderResults();
    setStatus("已请求暂停。可立即写入已完成的待确认标签，当前正在分析的素材会在返回后再暂停。");
  }

  function createAnalysisAbortController() {
    return typeof AbortController === "function" ? new AbortController() : null;
  }

  function abortCurrentAnalysis() {
    const controller = state.analysisAbortController;
    if (controller && controller.signal && !controller.signal.aborted) {
      controller.abort();
    }
  }

  function isAnalysisAbortError(error) {
    const message = formatError(error).toLowerCase();
    return (error && error.name === "AbortError") || message.includes("已停止") || message.includes("abort") || message.includes("中止");
  }

  function createAnalysisAbortError(message) {
    const error = new Error(message || "分析已中止");
    error.name = "AbortError";
    return error;
  }

  async function continueAnalysis() {
    if (state.running) return;
    state.paused = false;
    await analyzeSelected();
  }

  async function restartAnalysis() {
    if (state.running) return;
    state.paused = false;
    state.pauseRequested = false;
    state.results = [];
    renderAll();
    await analyzeSelected();
  }

  async function analyzeItem(item, model, allowedTags, settings, onProgress = null) {
    let media = null;
    let diagnosticPath = "";
    let diagnostics = null;
    try {
      reportAnalysisStage(onProgress, "准备素材", 0.08);
      media = await prepareMedia(item, settings, onProgress);
      reportAnalysisStage(onProgress, `已准备 ${media.frameCount} 张图像`, 0.34);
      reportAnalysisStage(onProgress, "保存诊断", 0.38);
      const savedDiagnostics = saveDiagnostics(item, media, settings);
      diagnosticPath = savedDiagnostics.path;
      diagnostics = savedDiagnostics.diagnostics;
      reportAnalysisStage(onProgress, "调用 AI", 0.45);
      const object = await requestAiTagsWithRetry(item, model, allowedTags, settings, media, onProgress);
      reportAnalysisStage(onProgress, "整理标签", 0.88);
      const normalizedCandidates = normalizeTagCandidatesForAllowedTags(
        Array.isArray(object.tags) ? object.tags : [],
        object.confidence,
        allowedTags
      );
      const candidates = normalizedCandidates.candidates;
      const allowed = new Set(allowedTags);
      const baseAllowed = new Set(getAllowedTags());
      const filteredTags = normalizedCandidates.filteredTags;
      const allowedCandidates = candidates
        .filter((tag) => allowed.has(tag.name))
        .map((tag) => calibrateContextualTagConfidence(tag, media, object.reason))
        .map((tag) => ({ ...tag, source: getReviewTagSource(tag.name, baseAllowed) }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, settings.maxTags);
      const highConfidenceTags = allowedCandidates.filter((tag) => tag.confidence >= settings.autoConfidence);
      const autoWriteEnabled = settings.autoApplyHighConfidence && !settings.previewBeforeWrite;
      const autoTags = autoWriteEnabled ? highConfidenceTags.filter((tag) => tag.source !== "template") : [];
      const reviewTags = allowedCandidates
        .filter((tag) => tag.confidence >= settings.hideConfidence && (!autoWriteEnabled || tag.source === "template" || tag.confidence < settings.autoConfidence))
        .map((tag) => ({ ...tag, selected: true }));
      const hiddenCount = allowedCandidates.filter((tag) => tag.confidence < settings.hideConfidence).length;
      let autoSaved = false;
      if (autoTags.length && typeof item.save === "function" && !item.external) {
        reportAnalysisStage(onProgress, "写入高置信标签", 0.94);
        await mergeTagsIntoItem(item, autoTags.map((tag) => tag.name), settings.writeAnnotation ? object.reason : "", "自动写入高置信标签");
        autoSaved = true;
      }
      reportAnalysisStage(onProgress, "完成", 0.98);
      const tags = reviewTags.map((tag) => tag.name);
      const messageParts = [];
      if (object.backend) messageParts.push(`后端：${formatBackendLabel(object.backend)}`);
      if (autoTags.length) messageParts.push(autoSaved ? `已自动写入 ${autoTags.length} 个高置信标签` : `${autoTags.length} 个高置信标签待写入`);
      if (!autoWriteEnabled && highConfidenceTags.length) messageParts.push(`${highConfidenceTags.length} 个高置信标签待确认`);
      if (reviewTags.length) messageParts.push(`${reviewTags.length} 个标签需要确认`);
      if (hiddenCount) messageParts.push(`${hiddenCount} 个低置信标签已隐藏`);
      return {
        status: reviewTags.length ? "ready" : (autoTags.length ? "applied" : "failed"),
        message: messageParts.length ? `${messageParts.join("，")}。${object.reason || ""}` : "AI 未返回达到置信度门槛的标签",
        tags,
        autoTags,
        reviewTags,
        filteredTags,
        hiddenCount,
        aiReason: object.reason || "",
        aiBackend: object.backend || "",
        frameCount: media.frameCount,
        requestCount: object.__requestPlan ? object.__requestPlan.requestCount : 0,
        mediaChunkCount: object.__requestPlan ? object.__requestPlan.mediaChunkCount : 0,
        tagChunkCount: object.__requestPlan ? object.__requestPlan.tagChunkCount : 0,
        diagnosticPath,
        diagnostics,
        confidence: clampNumber(object.confidence, 0, 1, 0)
      };
    } catch (error) {
      if (diagnosticPath) error.diagnosticPath = diagnosticPath;
      if (diagnostics) error.diagnostics = diagnostics;
      throw error;
    } finally {
      await cleanupMedia(media);
    }
  }

  function reportAnalysisStage(onProgress, stage, itemProgress) {
    if (typeof onProgress !== "function") return;
    onProgress(stage, clampNumber(itemProgress, 0, 0.98, 0));
  }

  async function requestAiTagsWithRetry(item, model, allowedTags, settings, media, onProgress = null) {
    let lastError = null;
    const retryCount = clampNumber(settings.aiRetryCount, 0, 10, AI_RETRY_COUNT);
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        if (attempt > 0) reportAnalysisStage(onProgress, `重试 AI ${attempt}/${retryCount}`, 0.46);
        return await requestAiTags(item, model, allowedTags, settings, media, onProgress);
      } catch (error) {
        if (isAnalysisAbortError(error)) throw error;
        lastError = error;
        if (attempt >= retryCount || !isRetryableAiError(error)) break;
        reportAnalysisStage(onProgress, `等待重试 ${attempt + 1}/${retryCount}`, 0.46);
        await delay(AI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
    throw new Error(`AI 请求失败，已重试 ${retryCount} 次：${formatError(lastError)}`);
  }

  async function requestAiTags(item, model, allowedTags, settings, media, onProgress = null) {
    const plan = buildAiRequestPlan(item, allowedTags, settings, media);
    reportAnalysisStage(onProgress, "规划请求", 0.42);
    if (plan.requestCount > 1) {
      const message = `AI 请求将分为 ${plan.requestCount} 次：图片组 ${plan.mediaChunkCount}，标签组 ${plan.maxTagChunkCount}。`;
      setStatus(message);
      updateResult(getItemId(item), {
        message,
        requestCount: plan.requestCount,
        mediaChunkCount: plan.mediaChunkCount,
        tagChunkCount: plan.maxTagChunkCount
      });
    }
    const objects = [];
    for (let index = 0; index < plan.requests.length; index += 1) {
      if (state.pauseRequested) throw createAnalysisAbortError("分析已暂停");
      const request = plan.requests[index];
      const requestStart = 0.48 + (index / plan.requestCount) * 0.34;
      reportAnalysisStage(onProgress, `调用 AI ${index + 1}/${plan.requestCount}`, requestStart);
      const object = await requestAiTagsSingle(item, model, request.allowedTags, settings, request.media, {
        ...request.chunkInfo,
        chunkIndex: index,
        chunkCount: plan.requestCount
      });
      reportAnalysisStage(onProgress, `接收结果 ${index + 1}/${plan.requestCount}`, Math.min(requestStart + 0.18 / plan.requestCount, 0.84));
      object.__allowedTags = request.allowedTags;
      object.__chunkInfo = request.chunkInfo;
      objects.push(object);
    }
    reportAnalysisStage(onProgress, "合并结果", 0.86);
    const mergeLimit = plan.requestCount > 1 ? Math.max(settings.maxTags * 3, settings.maxTags + 12) : settings.maxTags;
    const mergedObject = mergeAiObjects(objects, mergeLimit);
    const object = plan.requestCount > 1
      ? await reviewChunkedAiObjects(item, model, allowedTags, settings, objects, mergedObject, plan)
      : mergedObject;
    object.__requestPlan = {
      requestCount: plan.requestCount + (object.__reviewed ? 1 : 0),
      mediaChunkCount: plan.mediaChunkCount,
      tagChunkCount: plan.maxTagChunkCount
    };
    return object;
  }

  async function requestAiTagsSingle(item, model, allowedTags, settings, media, chunkInfo = {}) {
    if (!model) {
      throw new Error("未配置默认视觉模型，请先打开 AI 设置。");
    }
    return requestEagleAiTags(item, model, allowedTags, settings, media, chunkInfo);
  }

  async function requestEagleAiTags(item, model, allowedTags, settings, media, chunkInfo = {}) {
    const ai = eagle.extraModule.ai;
    const messages = [
      {
        role: "system",
        content: buildSystemPrompt(allowedTags, settings.maxTags, settings.globalPrompt, chunkInfo, settings)
      },
      {
        role: "user",
        content: [
          { type: "text", text: buildUserPrompt(item, media.kind, media.frameCount, settings, chunkInfo) },
          ...media.images.map((image) => ({ type: "image", image }))
        ]
      }
    ];
    if (typeof ai.generateText !== "function") {
      throw new Error("当前 AI SDK 没有 generateText()，请更新 Eagle AI 模型套件");
    }
    const response = await withTimeout(
      ai.generateText({
        model,
        messages
      }),
      AI_REQUEST_TIMEOUT_MS,
      "AI 请求超时"
    );
    const text = typeof response === "string" ? response : response && response.text;
    return {
      ...parseAiJson(text),
      backend: "eagle"
    };
  }

  async function reviewChunkedAiObjects(item, model, allowedTags, settings, objects, mergedObject, plan) {
    if (!objects.length || plan.requestCount <= 1) return limitAiObjectTags(mergedObject, settings.maxTags);
    const candidateTags = collectReviewCandidateTags(objects, mergedObject, allowedTags);
    if (!candidateTags.length) return limitAiObjectTags(mergedObject, settings.maxTags);
    const reviewAllowedTags = normalizeTagList(candidateTags.map((tag) => tag.name));
    const chunkSummaries = objects.map((object, index) => summarizeChunkObject(object, index)).join("\n");
    const messages = [
      {
        role: "system",
        content: buildReviewSystemPrompt(reviewAllowedTags, settings.maxTags, settings.globalPrompt, settings)
      },
      {
        role: "user",
        content: buildReviewUserPrompt(item, mergedObject, candidateTags, chunkSummaries, plan, settings)
      }
    ];
    try {
      const ai = eagle.extraModule.ai;
      if (typeof ai.generateText !== "function") return limitAiObjectTags(mergedObject, settings.maxTags);
      const response = await withTimeout(
        ai.generateText({ model, messages }),
        AI_REQUEST_TIMEOUT_MS,
        "AI 请求超时"
      );
      const text = typeof response === "string" ? response : response && response.text;
      const reviewed = parseAiJson(text);
      const reviewedCandidates = normalizeTagCandidatesForAllowedTags(Array.isArray(reviewed.tags) ? reviewed.tags : [], reviewed.confidence, reviewAllowedTags)
        .candidates
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, settings.maxTags);
      if (!reviewedCandidates.length) return limitAiObjectTags(mergedObject, settings.maxTags);
      return {
        tags: reviewedCandidates,
        confidence: normalizeConfidenceValue(reviewed.confidence, mergedObject.confidence),
        reason: reviewed.reason || mergedObject.reason,
        backend: mergedObject.backend || "eagle",
        __reviewed: true
      };
    } catch (error) {
      console.warn("Chunked AI review failed; using merged chunk result.", error);
      return limitAiObjectTags(mergedObject, settings.maxTags);
    }
  }

  function limitAiObjectTags(object, maxTags) {
    return {
      ...object,
      tags: Array.isArray(object.tags) ? object.tags.slice(0, maxTags) : []
    };
  }

  function collectReviewCandidateTags(objects, mergedObject, allowedTags) {
    const byName = new Map();
    const addCandidate = (tag) => {
      if (!tag || !tag.name) return;
      const existing = byName.get(tag.name);
      if (!existing || tag.confidence > existing.confidence) byName.set(tag.name, tag);
    };
    normalizeTagCandidatesForAllowedTags(mergedObject.tags, mergedObject.confidence, allowedTags).candidates.forEach(addCandidate);
    objects.forEach((object) => {
      normalizeTagCandidatesForAllowedTags(Array.isArray(object.tags) ? object.tags : [], object.confidence, allowedTags).candidates.forEach(addCandidate);
    });
    return [...byName.values()].sort((a, b) => b.confidence - a.confidence);
  }

  function buildReviewSystemPrompt(candidateTags, maxTags, globalPrompt, settings = {}) {
    const candidateScopeText = settings.allowOutOfPoolSuggestions
      ? "候选标签池来自当前标签池和已开启的默认模板兜底建议；只能从这些候选里选择，不要再创造新标签。"
      : "候选标签池来自当前标签池；只能从这些候选里选择，不要创造新标签。";
    const promptParts = [
      "你是游戏视觉特效素材标签复核员。",
      "你会看到多个分块 AI 分析的候选标签和完整文字描述，请从候选标签中重新筛选最终标签。",
      candidateScopeText,
      "不要输出组合标签。",
      `最多保留 ${maxTags} 个最符合完整素材的标签。`,
      "不要因为某个分块局部高分就保留标签；只有完整描述中有明确视觉证据、动作证据或风格证据时才提高 confidence。",
      "如果完整描述明确支持某个候选标签，即使它只来自部分分块，也可以保留较高置信度；如果完整描述不支持，即使局部分块分数很高也要降分或删除。",
      "视频或动图的设计稿、教程、教学、制作过程相关标签只有在完整描述明确提到绘画过程或软件/引擎操作界面时才可高置信保留；否则应删除或降到 0.64 以下。",
      "confidence 仍表示完整素材层面的可见证据强度：0.9 以上用于强且明确，0.8-0.89 用于明显成立，0.65-0.79 用于局部或辅助成立，低于 0.65 通常不要输出。",
      "必须只输出 JSON，不要输出 Markdown，不要使用代码块。",
      "JSON 格式：{\"tags\":[{\"name\":\"标签1\",\"confidence\":0.88},{\"name\":\"标签2\",\"confidence\":0.72}],\"confidence\":0.82,\"reason\":\"简短说明最终选择依据\"}",
      `候选标签池：${candidateTags.join("、")}`
    ];
    const customPrompt = String(globalPrompt || "").trim();
    if (customPrompt) {
      promptParts.splice(4, 0, `用户全局分析偏好：\n${customPrompt}`, "用户全局分析偏好不能覆盖候选标签池、JSON 格式和置信度要求。");
    }
    return promptParts.join("\n");
  }

  function buildReviewUserPrompt(item, mergedObject, candidateTags, chunkSummaries, plan, settings = {}) {
    const candidateText = candidateTags
      .map((tag) => `${tag.name}: ${Math.round(tag.confidence * 100)}%`)
      .join("，");
    const parts = [
      `分块情况：图片组 ${plan.mediaChunkCount}，标签组 ${plan.maxTagChunkCount}，初步请求 ${plan.requestCount} 次。`,
      `机械合并候选：${candidateText}`,
      `完整分块描述：${mergedObject.reason || ""}`,
      "逐块候选和描述：",
      chunkSummaries,
      "请基于完整素材语义重新筛选最终标签。"
    ];
    if (settings.includeTitleInPrompt) {
      parts.unshift(`素材名称：${getItemName(item)}`);
    }
    return parts.join("\n");
  }

  function summarizeChunkObject(object, index) {
    const chunkInfo = object.__chunkInfo || {};
    const tags = (Array.isArray(object.__allowedTags)
      ? normalizeTagCandidatesForAllowedTags(Array.isArray(object.tags) ? object.tags : [], object.confidence, object.__allowedTags).candidates
      : normalizeTagCandidates(Array.isArray(object.tags) ? object.tags : [], object.confidence))
      .slice(0, 8)
      .map((tag) => `${tag.name} ${Math.round(tag.confidence * 100)}%`)
      .join("，");
    const parts = [`分块 ${index + 1}`];
    if (chunkInfo.mediaChunkCount > 1) parts.push(`图片组 ${Number(chunkInfo.mediaChunkIndex || 0) + 1}/${chunkInfo.mediaChunkCount}`);
    if (chunkInfo.tagChunkCount > 1) parts.push(`标签组 ${Number(chunkInfo.tagChunkIndex || 0) + 1}/${chunkInfo.tagChunkCount}`);
    return `${parts.join("，")}：候选 ${tags || "无"}；描述：${object.reason || ""}`;
  }

  function buildSystemPrompt(allowedTags, maxTags, globalPrompt, chunkInfo = {}, settings = {}) {
    const semanticGuidance = buildTagSemanticGuidance(allowedTags);
    const tagScopeText = settings.allowOutOfPoolSuggestions
      ? "只能从给定标签池中选择标签；标签池可能包含当前 Eagle 标签和已开启的默认模板兜底建议，仍禁止输出标签池之外的新标签或同义词。"
      : "只能从当前标签池中选择标签，禁止创造新标签，禁止输出不在标签池里的同义词。";
    const promptParts = [
      "你是游戏视觉特效素材标签管理员。",
      tagScopeText,
      `每个素材最多选择 ${maxTags} 个最有检索价值的标签。`,
      "优先判断特效类型、元素属性、颜色、用途、风格。",
      "如果是视频或动图，请综合多帧动作变化判断，不要只看首帧。",
      "必须只输出 JSON，不要输出 Markdown，不要使用代码块。",
      "每个标签都必须给出 0 到 1 的 confidence，表示可见证据强度，不是标签相关性，也不是你主观确信程度。",
      "confidence 评分必须保守：0.95-1.0 只用于画面中直接、主导、无歧义的标签；0.85-0.94 用于强证据但仍有轻微不确定；0.65-0.84 用于可见但非主导或需结合多帧判断；低于 0.65 用于弱线索。",
      "泛标签、风格标签、教程/皮肤/技能/能量/武器等宽泛概念通常不要超过 0.92；组合标签或多概念标签通常不要超过 0.90。",
      "视频或动图素材的“设计稿/教程/教学/制作过程”相关标签必须更保守：除非画面明确出现具体绘画过程、软件/引擎操作界面、节点/时间轴/Inspector/材质/蓝图/Niagara/Unity/Unreal/Houdini 等操作证据，否则不要输出，或 confidence 不要超过 0.64。",
      "不要把所有标签都打成高分；至少拉开主标签和辅助标签的分数差距。",
      "JSON 格式：{\"tags\":[{\"name\":\"标签1\",\"confidence\":0.88},{\"name\":\"标签2\",\"confidence\":0.71}],\"confidence\":0.78,\"reason\":\"简短原因\"}",
      `标签池：${allowedTags.join("、")}`
    ];
    if (semanticGuidance) promptParts.splice(5, 0, semanticGuidance);
    if (chunkInfo.chunkCount > 1) {
      const parts = [`这是 AI 请求分块 ${chunkInfo.chunkIndex + 1}/${chunkInfo.chunkCount}`];
      if (chunkInfo.mediaChunkCount > 1) parts.push(`图片组 ${chunkInfo.mediaChunkIndex + 1}/${chunkInfo.mediaChunkCount}`);
      if (chunkInfo.tagChunkCount > 1) parts.push(`标签池组 ${chunkInfo.tagChunkIndex + 1}/${chunkInfo.tagChunkCount}`);
      promptParts.splice(2, 0, `${parts.join("，")}。只从本次请求给出的标签池中选择；最终结果会由插件合并。`);
    }
    const customPrompt = String(globalPrompt || "").trim();
    if (customPrompt) {
      promptParts.splice(5, 0, `用户全局分析偏好：\n${customPrompt}`, "用户全局分析偏好不能覆盖标签池、JSON 格式和置信度要求。");
    }
    return promptParts.join("\n");
  }

  function buildTagSemanticGuidance(allowedTags) {
    const allowed = new Set((Array.isArray(allowedTags) ? allowedTags : []).map((tag) => String(tag || "").trim()).filter(Boolean));
    const rules = TAG_SEMANTIC_RULES
      .filter(([tag]) => allowed.has(tag))
      .map(([tag, rule]) => `- ${tag}：${rule}`);
    if (!rules.length) return "";
    return [
      "标签语义规则（只解释标签池中实际存在的标签；这些说明不能扩展可输出标签池）：",
      "只根据视觉特效本体选择标签，忽略静态背景、场景、角色本体、武器本体和不会变化的物体。",
      ...rules
    ].join("\n");
  }

  function buildUserPrompt(item, kind, frameCount, settings = {}, chunkInfo = {}) {
    const name = settings.includeTitleInPrompt ? `素材“${getItemName(item)}”` : "这个素材";
    const mediaPart = chunkInfo.mediaChunkCount > 1
      ? `这是第 ${chunkInfo.mediaChunkIndex + 1}/${chunkInfo.mediaChunkCount} 组图片，本组包含 ${frameCount} 张。`
      : "";
    if (kind === "animated" || kind === "video") {
      return `请分析${name}。这是${kind === "video" ? "视频" : "动图"}抽取出的 ${frameCount} 张代表帧。${mediaPart}请根据可见动作变化返回标签。`;
    }
    return `请分析${name}的视觉内容并返回标签。${mediaPart}`;
  }

  function buildAiRequestPlan(item, allowedTags, settings, media) {
    const mediaChunks = buildMediaChunks(item, allowedTags, settings, media);
    const requests = [];
    let maxTagChunkCount = 1;
    mediaChunks.forEach((mediaChunk, mediaChunkIndex) => {
      const mediaChunkInfo = {
        mediaChunkIndex,
        mediaChunkCount: mediaChunks.length
      };
      const tagChunks = buildAllowedTagChunks(item, allowedTags, settings, mediaChunk, mediaChunkInfo);
      maxTagChunkCount = Math.max(maxTagChunkCount, tagChunks.length);
      tagChunks.forEach((tagChunk, tagChunkIndex) => {
        requests.push({
          media: mediaChunk,
          allowedTags: tagChunk,
          chunkInfo: {
            mediaChunkIndex,
            mediaChunkCount: mediaChunks.length,
            tagChunkIndex,
            tagChunkCount: tagChunks.length
          }
        });
      });
    });
    return {
      requests,
      requestCount: requests.length,
      mediaChunkCount: mediaChunks.length,
      maxTagChunkCount
    };
  }

  function buildMediaChunks(item, allowedTags, settings, media) {
    const images = Array.isArray(media.images) ? media.images : [];
    const filePaths = Array.isArray(media.filePaths) ? media.filePaths : [];
    if (images.length <= 1) return [media];
    const tokenLimit = getRequestTokenLimit(settings);
    const baseTokens = estimateBasePromptTokens(item, settings, media, { mediaChunkIndex: 0, mediaChunkCount: 1 });
    const sampleTagTokens = estimateSampleTagBudget(allowedTags);
    const imageBudget = Math.max(
      ESTIMATED_IMAGE_TOKENS,
      tokenLimit - baseTokens - sampleTagTokens - REQUEST_SAFETY_TOKENS
    );
    const maxImagesPerRequest = Math.max(1, Math.floor(imageBudget / ESTIMATED_IMAGE_TOKENS));
    if (images.length <= maxImagesPerRequest) return [media];
    const chunks = [];
    for (let start = 0; start < images.length; start += maxImagesPerRequest) {
      const chunkImages = images.slice(start, start + maxImagesPerRequest);
      chunks.push({
        ...media,
        images: chunkImages,
        filePaths: filePaths.slice(start, start + maxImagesPerRequest),
        frameCount: chunkImages.length,
        totalFrameCount: media.frameCount,
        frameStartIndex: start
      });
    }
    return chunks;
  }

  function buildAllowedTagChunks(item, allowedTags, settings, media, mediaChunkInfo = {}) {
    const tokenLimit = getRequestTokenLimit(settings);
    const imageTokens = estimateImageTokens(media);
    const baseTokens = estimateBasePromptTokens(item, settings, media, mediaChunkInfo);
    const tagBudget = Math.max(
      MIN_TAG_BUDGET_TOKENS,
      tokenLimit - baseTokens - imageTokens - REQUEST_SAFETY_TOKENS
    );
    const chunks = [];
    let current = [];
    let currentTokens = 0;
    allowedTags.forEach((tag) => {
      const tagTokens = estimateTextTokens(tag) + 2;
      if (current.length && currentTokens + tagTokens > tagBudget) {
        chunks.push(current);
        current = [];
        currentTokens = 0;
      }
      current.push(tag);
      currentTokens += tagTokens;
    });
    if (current.length) chunks.push(current);
    return chunks.length ? chunks : [allowedTags];
  }

  function estimateBasePromptTokens(item, settings, media, mediaChunkInfo = {}) {
    return estimateTextTokens(
      buildSystemPrompt([], settings.maxTags, settings.globalPrompt, { chunkIndex: 0, chunkCount: 1, ...mediaChunkInfo }, settings) +
      "\n" +
      buildUserPrompt(item, media.kind, media.frameCount, settings, mediaChunkInfo)
    );
  }

  function estimateImageTokens(media) {
    const count = Array.isArray(media.images) ? media.images.length : 0;
    return count * ESTIMATED_IMAGE_TOKENS;
  }

  function estimateSampleTagBudget(allowedTags) {
    if (!Array.isArray(allowedTags) || !allowedTags.length) return MIN_TAG_BUDGET_TOKENS;
    const sampleTokens = allowedTags
      .slice(0, Math.min(allowedTags.length, 120))
      .reduce((sum, tag) => sum + estimateTextTokens(tag) + 2, 0);
    return Math.max(MIN_TAG_BUDGET_TOKENS, Math.min(sampleTokens, MIN_TAG_BUDGET_TOKENS * 2));
  }

  function getRequestTokenLimit(settings) {
    return Math.max(MIN_REQUEST_CHUNK_K, Math.min(MAX_REQUEST_CHUNK_K, settings.requestChunkK || DEFAULT_REQUEST_CHUNK_K)) * 1024;
  }

  function mergeAiObjects(objects, maxTags) {
    const byName = new Map();
    const reasons = [];
    let confidenceTotal = 0;
    let confidenceCount = 0;
    let mediaChunkCount = 1;
    let tagChunkCount = 1;
    const backends = new Set();
    objects.forEach((object) => {
      if (!object || typeof object !== "object") return;
      if (object.backend) backends.add(object.backend);
      const chunkInfo = object.__chunkInfo || {};
      mediaChunkCount = Math.max(mediaChunkCount, Number(chunkInfo.mediaChunkCount) || 1);
      tagChunkCount = Math.max(tagChunkCount, Number(chunkInfo.tagChunkCount) || 1);
      const normalizedObjectCandidates = Array.isArray(object.__allowedTags)
        ? normalizeTagCandidatesForAllowedTags(Array.isArray(object.tags) ? object.tags : [], object.confidence, object.__allowedTags).candidates
        : normalizeTagCandidates(Array.isArray(object.tags) ? object.tags : [], object.confidence);
      normalizedObjectCandidates.forEach((tag) => {
        const record = byName.get(tag.name) || {
          name: tag.name,
          maxConfidence: 0,
          confidenceTotal: 0,
          hitCount: 0,
          eligibleCount: 0,
          mediaChunks: new Set(),
          tagChunks: new Set()
        };
        record.maxConfidence = Math.max(record.maxConfidence, tag.confidence);
        record.confidenceTotal += tag.confidence;
        record.hitCount += 1;
        record.mediaChunks.add(Number(chunkInfo.mediaChunkIndex) || 0);
        record.tagChunks.add(Number(chunkInfo.tagChunkIndex) || 0);
        byName.set(tag.name, record);
      });
      const allowedTags = new Set(Array.isArray(object.__allowedTags) ? object.__allowedTags : []);
      allowedTags.forEach((tagName) => {
        const name = cleanTag(tagName);
        if (!name) return;
        const record = byName.get(name) || {
          name,
          maxConfidence: 0,
          confidenceTotal: 0,
          hitCount: 0,
          eligibleCount: 0,
          mediaChunks: new Set(),
          tagChunks: new Set()
        };
        record.eligibleCount += 1;
        byName.set(name, record);
      });
      if (!allowedTags.size) {
        for (const record of byName.values()) {
          record.eligibleCount += 1;
        }
      }
      if (object.reason) reasons.push(String(object.reason));
      const confidence = normalizeConfidenceValue(object.confidence, NaN);
      if (Number.isFinite(confidence)) {
        confidenceTotal += confidence;
        confidenceCount += 1;
      }
    });
    const tags = [...byName.values()]
      .filter((record) => record.hitCount > 0)
      .map((record) => calibrateMergedTagConfidence(record, mediaChunkCount, tagChunkCount))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxTags);
    return {
      tags,
      confidence: confidenceCount ? confidenceTotal / confidenceCount : 0.5,
      reason: dedupeReasonParts(reasons).join("；"),
      backend: [...backends].join(" + ")
    };
  }

  function calibrateMergedTagConfidence(record, mediaChunkCount, tagChunkCount) {
    const hitCount = Math.max(1, record.hitCount || 1);
    const eligibleCount = Math.max(hitCount, record.eligibleCount || hitCount);
    const mediaHits = record.mediaChunks && record.mediaChunks.size ? record.mediaChunks.size : 1;
    const averageConfidence = record.confidenceTotal / hitCount;
    let confidence = (record.maxConfidence * 0.65) + (averageConfidence * 0.35);
    const coverage = hitCount / eligibleCount;
    const hasMultipleMediaChunks = mediaChunkCount > 1;
    const hasSplitTagPool = tagChunkCount > 1;

    if (hasMultipleMediaChunks) {
      if (mediaHits <= 1) {
        confidence = Math.min(confidence, 0.79);
      } else {
        confidence = Math.min(confidence + Math.min(0.06, (mediaHits - 1) * 0.02), 0.94);
      }
    }

    if (hasSplitTagPool && hitCount <= 1) confidence = Math.min(confidence, 0.79);

    if (coverage < 0.34) confidence = Math.min(confidence, 0.78);
    else if (coverage < 0.67) confidence = Math.min(confidence, 0.88);

    return {
      name: record.name,
      confidence: Math.round(clampNumber(confidence, 0, 1, 0.5) * 100) / 100
    };
  }

  function calibrateContextualTagConfidence(tag, media, reason) {
    if (!tag || !isVideoLikeMedia(media) || !isProcessOrTutorialTag(tag.name)) return tag;
    if (hasProcessOrEngineEvidence(reason)) return tag;
    return {
      ...tag,
      confidence: Math.min(tag.confidence, 0.64)
    };
  }

  function isVideoLikeMedia(media) {
    return media && (media.kind === "video" || media.kind === "animated");
  }

  function isProcessOrTutorialTag(name) {
    const text = String(name || "").toLowerCase();
    return [
      "设计稿", "設計稿", "教程", "教学", "教學", "制作过程", "製作過程", "过程", "過程",
      "tutorial", "lesson", "teaching", "process", "making of", "workflow", "breakdown", "design draft",
      "チュートリアル", "制作過程", "튜토리얼", "강좌", "제작 과정"
    ].some((keyword) => text.includes(keyword.toLowerCase()));
  }

  function hasProcessOrEngineEvidence(reason) {
    const text = String(reason || "").toLowerCase();
    if (!text.trim()) return false;
    return [
      "绘画", "绘制", "画笔", "笔刷", "图层", "时间轴", "节点", "材质", "蓝图", "检查器", "属性面板", "操作界面", "编辑器界面", "引擎界面",
      "unity", "unreal", "ue4", "ue5", "houdini", "niagara", "cascade", "shader graph", "blueprint", "inspector", "timeline", "node graph", "material editor", "viewport", "editor ui",
      "paint", "painting", "brush", "layer", "drawing process", "engine interface", "software interface", "screen recording",
      "ペイント", "ブラシ", "レイヤー", "タイムライン", "ノード", "エンジン", "에디터", "엔진", "타임라인", "노드", "브러시", "레이어"
    ].some((keyword) => text.includes(keyword.toLowerCase()));
  }

  function dedupeReasonParts(parts) {
    const seen = new Set();
    const output = [];
    parts.forEach((part) => {
      const text = String(part || "").trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      output.push(text);
    });
    return output;
  }

  async function prepareMedia(item, settings, onProgress = null) {
    const sourcePath = getItemFilePath(item);
    const ext = getItemExt(item, sourcePath);
    reportAnalysisStage(onProgress, "检查素材格式", 0.1);
    if (!sourcePath && !getItemPreviewPath(item)) {
      throw new Error("找不到原文件或预览图路径");
    }
    if (ext === "png" && await isAnimatedPng(sourcePath)) {
      return extractFramesMedia(sourcePath, "animated", settings.maxAnimatedFrames, settings, onProgress);
    }
    if (STATIC_IMAGE_EXTS.has(ext)) {
      reportAnalysisStage(onProgress, "读取图片", 0.28);
      return singleImageMedia(sourcePath || getItemPreviewPath(item), "image");
    }
    if (CONVERTIBLE_IMAGE_EXTS.has(ext)) {
      return convertStillImageMedia(sourcePath, ext, onProgress);
    }
    if (ext === WEBP_EXT) {
      const animated = await isAnimatedWebp(sourcePath);
      if (!animated) reportAnalysisStage(onProgress, "读取图片", 0.28);
      if (!animated) return singleImageMedia(sourcePath, "image");
      try {
        return await extractFramesMedia(sourcePath, "animated", settings.maxAnimatedFrames, settings, onProgress);
      } catch (error) {
        return fallbackAnimatedStillMedia(item, sourcePath, error, onProgress);
      }
    }
    if (ANIMATED_EXTS.has(ext)) {
      return extractFramesMedia(sourcePath, "animated", settings.maxAnimatedFrames, settings, onProgress);
    }
    if (VIDEO_EXTS.has(ext)) {
      return extractFramesMedia(sourcePath, "video", settings.maxVideoFrames, settings, onProgress);
    }
    if (PREVIEW_EXTS.has(ext)) {
      const preview = getItemPreviewPath(item);
      if (!preview) throw new Error("该设计文件没有可用预览图");
      reportAnalysisStage(onProgress, "读取预览图", 0.28);
      return singleImageMedia(preview, "preview");
    }
    throw new Error(`暂不支持该文件格式：${ext || "未知"}`);
  }

  function singleImageMedia(filePath, kind) {
    return {
      kind,
      images: [toFileUrl(filePath)],
      filePaths: [filePath],
      frameCount: 1,
      tempDir: null,
      sourcePath: filePath,
      previewPath: ""
    };
  }

  async function convertStillImageMedia(sourcePath, ext, onProgress = null) {
    if (!sourcePath) throw new Error("找不到可转换的原文件路径");
    if (!fs || !os || !path || !cp) throw new Error("当前插件环境缺少 Node.js 能力，无法转换 TGA/DDS 图片");
    reportAnalysisStage(onProgress, "检测 FFmpeg", 0.12);
    const ffmpegPaths = await getFfmpegPaths();
    if (!ffmpegPaths.ffmpeg) throw new Error("未检测到 Eagle FFmpeg 扩展");
    reportAnalysisStage(onProgress, `转换 ${String(ext || "").toUpperCase()} 图片`, 0.24);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vfx-ai-tagger-"));
    const output = path.join(tempDir, "converted-image.png");
    try {
      await runFfmpegImageConvert(ffmpegPaths.ffmpeg, sourcePath, output);
      if (!fs.existsSync(output) || getFileSize(output) <= 0) {
        throw new Error("转换后没有生成可分析图片");
      }
      return {
        kind: "image",
        images: [toFileUrl(output)],
        filePaths: [output],
        frameCount: 1,
        tempDir,
        sourcePath,
        previewPath: "",
        convertedFrom: ext
      };
    } catch (error) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {}
      throw error;
    }
  }

  async function fallbackAnimatedStillMedia(item, sourcePath, originalError, onProgress = null) {
    const fallbackPath = findFallbackPreviewPath(item, sourcePath);
    if (fallbackPath) {
      reportAnalysisStage(onProgress, "动画 WebP 抽帧失败，改用预览图", 0.34);
      const media = singleImageMedia(fallbackPath, "preview");
      media.sourcePath = sourcePath;
      media.previewPath = fallbackPath;
      media.extractionWarning = formatError(originalError);
      return media;
    }
    const error = new Error(`动画 WebP 抽帧失败：${formatError(originalError)}。当前 Eagle FFmpeg 可能不支持该动画 WebP，请先转换为 GIF/MP4，或给素材生成可用缩略图后重试。`);
    error.cause = originalError;
    throw error;
  }

  async function extractFramesMedia(sourcePath, kind, maxFrames, settings, onProgress = null) {
    if (!sourcePath) throw new Error("找不到可抽帧的原文件路径");
    if (!fs || !os || !path || !cp) throw new Error("当前插件环境缺少 Node.js 能力，无法抽帧");
    reportAnalysisStage(onProgress, "检测 FFmpeg", 0.12);
    const ffmpegPaths = await getFfmpegPaths();
    if (!ffmpegPaths.ffmpeg || !ffmpegPaths.ffprobe) throw new Error("未检测到 Eagle FFmpeg 扩展");
    reportAnalysisStage(onProgress, "读取媒体时长", 0.15);
    const duration = await probeDuration(sourcePath);
    const times = computeFrameTimes(duration, settings.frameStepSeconds, maxFrames, settings.skipStart, settings.skipEnd);
    if (!times.length) throw new Error("无法计算抽帧时间点");
    reportAnalysisStage(onProgress, `抽帧 0/${times.length}`, 0.17);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vfx-ai-tagger-"));
    const frames = [];
    for (let index = 0; index < times.length; index += 1) {
      const output = path.join(tempDir, `frame-${String(index + 1).padStart(3, "0")}.jpg`);
      await runFfmpegExtract(ffmpegPaths.ffmpeg, sourcePath, output, times[index]);
      if (fs.existsSync(output) && getFileSize(output) > 0) {
        frames.push(output);
      } else if (fs.existsSync(output)) {
        fs.rmSync(output, { force: true });
      }
      reportAnalysisStage(onProgress, `抽帧 ${index + 1}/${times.length}`, 0.17 + ((index + 1) / times.length) * 0.18);
    }
    if (!frames.length) throw new Error("抽帧失败，没有生成可分析图片");
    return {
      kind,
      images: frames.map(toFileUrl),
      filePaths: frames,
      frameCount: frames.length,
      tempDir,
      sourcePath,
      previewPath: ""
    };
  }

  function saveDiagnostics(item, media, settings) {
    const diagnostics = buildDiagnostics(item, media, "");
    if (!settings.diagnosticEnabled) return { path: "", diagnostics };
    if (!fs || !path) throw new Error("当前插件环境缺少 Node.js 能力，无法保存诊断");
    if (!settings.diagnosticDir) throw new Error("已开启诊断保存，请先选择诊断保存文件夹");
    const targetDir = path.join(settings.diagnosticDir, `${Date.now()}-${safeFileName(getItemName(item))}`);
    fs.mkdirSync(targetDir, { recursive: true });
    diagnostics.images.forEach((image, index) => {
      if (!image.exists || !image.path) return;
      const ext = path.extname(image.path) || ".jpg";
      const dest = path.join(targetDir, `frame-${String(index + 1).padStart(3, "0")}${ext}`);
      fs.copyFileSync(image.path, dest);
      image.path = dest;
      image.url = toFileUrl(dest);
      image.previewUrl = image.url;
      image.size = getFileSize(dest);
    });
    diagnostics.diagnosticPath = targetDir;
    fs.writeFileSync(path.join(targetDir, "diagnostic.json"), JSON.stringify(diagnostics, null, 2), "utf8");
    return { path: targetDir, diagnostics };
  }

  function buildDiagnostics(item, media, diagnosticPath) {
    const sourcePath = media.sourcePath || getItemFilePath(item);
    const previewPath = media.previewPath || getItemPreviewPath(item);
    const images = (media.images || []).map((image, index) => {
      const imagePath = fileUrlToPath(image);
      const exists = Boolean(imagePath && fs && fs.existsSync(imagePath));
      return {
        path: imagePath,
        url: image,
        previewUrl: createDiagnosticPreviewUrl(imagePath, index),
        exists,
        size: exists ? getFileSize(imagePath) : 0
      };
    });
    return { sourcePath, previewPath, diagnosticPath, images };
  }

  function getFfmpegApi() {
    return window.eagle && eagle.extraModule && (eagle.extraModule.ffmpeg || eagle.extraModule.FFmpeg);
  }

  async function getFfmpegPaths() {
    const ffmpeg = getFfmpegApi();
    if (!ffmpeg) throw new Error("未检测到 Eagle FFmpeg 扩展");
    if (typeof ffmpeg.isInstalled === "function") {
      const installed = await ffmpeg.isInstalled();
      if (!installed) {
        if (typeof ffmpeg.install === "function") await ffmpeg.install();
        throw new Error("需要先安装 Eagle FFmpeg 依赖插件");
      }
    } else if (ffmpeg.isInstalled === false) {
      if (typeof ffmpeg.install === "function") await ffmpeg.install();
      throw new Error("需要先安装 Eagle FFmpeg 依赖插件");
    }
    if (typeof ffmpeg.getPaths === "function") {
      return await ffmpeg.getPaths();
    }
    if (ffmpeg.paths) {
      return ffmpeg.paths;
    }
    throw new Error("无法读取 FFmpeg 路径");
  }

  async function probeDuration(sourcePath) {
    const ffmpegPaths = await getFfmpegPaths();
    if (!ffmpegPaths.ffprobe) throw new Error("无法读取 ffprobe 路径");
    if (!cp) throw new Error("无法调用 ffprobe");
    return new Promise((resolve, reject) => {
      cp.execFile(ffmpegPaths.ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", sourcePath], (error, stdout, stderr) => {
        if (error) {
          reject(buildProcessError(error, stderr));
          return;
        }
        const duration = Number(String(stdout).trim());
        duration > 0 ? resolve(duration) : reject(new Error("无法读取媒体时长"));
      });
    });
  }

  async function runFfmpegExtract(ffmpegBinary, sourcePath, outputPath, second) {
    const args = ["-y", "-ss", String(second), "-i", sourcePath, "-frames:v", "1", "-q:v", "2", "-update", "1", outputPath];
    return new Promise((resolve, reject) => {
      cp.execFile(ffmpegBinary, args, (error, stdout, stderr) => error ? reject(buildProcessError(error, stderr)) : resolve());
    });
  }

  async function runFfmpegImageConvert(ffmpegBinary, sourcePath, outputPath) {
    const args = ["-y", "-i", sourcePath, "-frames:v", "1", "-update", "1", outputPath];
    return new Promise((resolve, reject) => {
      cp.execFile(ffmpegBinary, args, (error, stdout, stderr) => error ? reject(buildProcessError(error, stderr)) : resolve());
    });
  }

  async function isAnimatedWebp(filePath) {
    return hasFileMarkerSync(filePath, "ANIM", 65536);
  }

  async function isAnimatedPng(filePath) {
    return hasFileMarkerSync(filePath, "acTL", 4096);
  }

  function hasFileMarkerSync(filePath, marker, maxBytes) {
    if (!filePath || !fs) return false;
    let fd = null;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0) return false;
      fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(Math.min(maxBytes, stat.size));
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.includes(Buffer.from(marker));
    } catch (error) {
      return false;
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (closeError) {}
      }
    }
  }

  function buildProcessError(error, stderr) {
    const tail = tailProcessOutput(stderr);
    if (!tail) return error || new Error("命令执行失败");
    const message = error && error.message ? error.message : "命令执行失败";
    const wrapped = new Error(`${message}\n${tail}`);
    wrapped.cause = error;
    return wrapped;
  }

  function tailProcessOutput(output, maxLines = 10) {
    const lines = String(output || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(-maxLines).join("\n");
  }

  function findFallbackPreviewPath(item, sourcePath) {
    const candidates = [getItemPreviewPath(item)];
    candidates.push(...findSiblingThumbnailPaths(sourcePath));
    return candidates
      .map((candidate) => normalizeLocalPath(candidate))
      .find((candidate) => {
        if (!candidate || candidate === sourcePath || !fs || !fs.existsSync(candidate) || getFileSize(candidate) <= 0) return false;
        return isPreviewableImageExt(getMediaExt({}, candidate));
      }) || "";
  }

  function findSiblingThumbnailPaths(sourcePath) {
    if (!sourcePath || !fs || !path) return [];
    try {
      const dir = path.dirname(sourcePath);
      const sourceBase = path.basename(sourcePath, path.extname(sourcePath)).toLowerCase();
      return fs.readdirSync(dir)
        .filter((entry) => {
          const lower = entry.toLowerCase();
          const ext = path.extname(lower).slice(1);
          if (!isPreviewableImageExt(ext)) return false;
          return lower.includes("thumbnail") || lower.includes("thumb") || lower.includes(sourceBase);
        })
        .map((entry) => path.join(dir, entry));
    } catch (error) {
      return [];
    }
  }

  function computeFrameTimes(duration, stepSeconds, maxFrames, skipStart, skipEnd) {
    const start = clampNumber(skipStart, 0, duration, 0);
    const end = Math.max(start, duration - clampNumber(skipEnd, 0, duration, 0));
    const usable = Math.max(0.05, end - start);
    const cappedMax = Math.max(1, Math.min(120, Math.floor(maxFrames)));
    const step = clampNumber(stepSeconds, 0.125, 3, 1);
    const estimated = Math.max(1, Math.floor(usable / step) + 1);
    const count = Math.min(cappedMax, estimated);
    if (count === 1) return [roundTime(start + usable / 2)];
    const interval = usable / (count - 1);
    const times = [];
    for (let index = 0; index < count; index += 1) {
      times.push(roundTime(Math.min(end, start + interval * index)));
    }
    return [...new Set(times)];
  }

  async function cleanupMedia(media) {
    if (!media || !media.tempDir || !fs) return;
    try {
      fs.rmSync(media.tempDir, { recursive: true, force: true });
    } catch (error) {
      setStatus(`临时抽帧目录清理失败：${formatError(error)}`);
    }
  }

  async function applyReadyResults() {
    if (!canWriteReadyResults()) return;
    const ready = state.results.filter((result) => result.status === "ready" && getSelectedReviewTags(result).length);
    if (!ready.length) {
      resetWriteProgress();
      setStatus("没有可写入的分析结果。");
      return;
    }
    state.writing = true;
    els.applyBtn.disabled = true;
    updateWriteProgress(0, ready.length, 0);
    setControlsBusy(state.running);
    let saved = 0;
    let failed = 0;
    try {
      const settings = readSettings();
      for (const result of ready) {
        updateWriteProgress(saved + failed, ready.length, failed);
        const item = state.selectedItems.find((candidate) => getItemId(candidate) === result.id);
        if (!item) {
          failed += 1;
          updateResult(result.id, { status: "ready", message: "找不到对应素材，请重新导入当前选中素材后再试", errorType: "write" });
          updateWriteProgress(saved + failed, ready.length, failed);
          continue;
        }
        if (item.external || typeof item.save !== "function") {
          failed += 1;
          updateResult(result.id, { status: "ready", message: "外部导入文件无法写回 Eagle，请先把文件加入 Eagle 资源库", errorType: "write" });
          updateWriteProgress(saved + failed, ready.length, failed);
          continue;
        }
        try {
          await mergeTagsIntoItem(item, getSelectedReviewTags(result).map((tag) => tag.name), settings.writeAnnotation ? result.aiReason : "", "手动确认写入标签");
          saved += 1;
          updateResult(result.id, { status: "applied", message: "已写入 Eagle", errorType: "" });
        } catch (error) {
          failed += 1;
          updateResult(result.id, { status: "ready", message: `写入失败：${formatError(error)}`, errorType: "write" });
        }
        updateWriteProgress(saved + failed, ready.length, failed);
      }
    } finally {
      state.writing = false;
      setControlsBusy(state.running);
      renderAll();
    }
    const finalStatus = failed ? `已写入 ${saved} 个素材，${failed} 个写入失败。` : `已写入 ${saved} 个素材。`;
    setStatus(finalStatus);
    updateWriteProgress(saved + failed, ready.length, failed, finalStatus);
  }

  function updateAnalysisProgress(processed, total, currentItem, detail = {}) {
    if (!els.analysisProgressPanel || !els.analysisProgressBar) return;
    hideWriteProgressSlot();
    const safeTotal = Math.max(0, Number(total) || 0);
    if (!safeTotal) {
      resetAnalysisProgress();
      return;
    }
    const safeDone = Math.min(safeTotal, Math.max(0, Number(processed) || 0));
    const safeItemProgress = safeDone >= safeTotal ? 0 : Math.min(clampNumber(detail.itemProgress, 0, 1, 0), 0.95);
    const effectiveDone = safeDone + safeItemProgress;
    const percent = Math.round((effectiveDone / safeTotal) * 100);
    const counts = getAnalysisProgressCounts();
    const currentName = currentItem ? getItemName(currentItem) : "";
    els.analysisProgressPanel.hidden = false;
    els.analysisProgressPanel.classList.toggle("is-active", safeDone < safeTotal);
    els.analysisProgressText.textContent = safeDone >= safeTotal
      ? t("progressMeta.analysisDone", { done: safeDone, total: safeTotal })
      : t("progressMeta.analyzing", { done: safeDone, total: safeTotal });
    els.analysisProgressPercent.textContent = `${percent}%`;
    els.analysisProgressBar.style.width = `${percent}%`;
    const track = els.analysisProgressPanel.querySelector(".analysis-progress-track");
    if (track) track.setAttribute("aria-valuenow", String(percent));
    els.analysisProgressMeta.textContent = [
      detail.stage && safeDone < safeTotal ? t("progressMeta.stage", { stage: detail.stage }) : "",
      currentName && safeDone < safeTotal ? t("progressMeta.current", { name: currentName }) : "",
      t("progressMeta.ready", { count: counts.ready }),
      t("progressMeta.applied", { count: counts.applied }),
      t("progressMeta.failed", { count: counts.failed }),
      t("progressMeta.skipped", { count: counts.skipped })
    ].filter(Boolean).join(" · ");
  }

  function resetAnalysisProgress() {
    if (!els.analysisProgressPanel || !els.analysisProgressBar) return;
    hideAnalysisProgressSlot();
    els.analysisProgressPanel.classList.remove("is-active");
    els.analysisProgressText.textContent = t("progress.waitingAnalysis");
    els.analysisProgressPercent.textContent = "0%";
    els.analysisProgressBar.style.width = "0%";
    if (els.analysisProgressMeta) els.analysisProgressMeta.textContent = "";
    const track = els.analysisProgressPanel.querySelector(".analysis-progress-track");
    if (track) track.setAttribute("aria-valuenow", "0");
  }

  function getAnalysisProgressCounts() {
    return state.results.reduce((counts, result) => {
      if (result.status === "ready") counts.ready += 1;
      if (result.status === "applied") counts.applied += 1;
      if (result.status === "failed") counts.failed += 1;
      if (result.status === "skipped") counts.skipped += 1;
      return counts;
    }, { ready: 0, applied: 0, failed: 0, skipped: 0 });
  }

  function updateWriteProgress(done, total, failed = 0, message = "") {
    if (!els.writeProgressPanel || !els.writeProgressBar) return;
    hideAnalysisProgressSlot();
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
    const percent = safeTotal ? Math.round((safeDone / safeTotal) * 100) : 0;
    const text = message || t("progressMeta.writing", { done: safeDone, total: safeTotal });
    els.writeProgressPanel.hidden = false;
    els.writeProgressPanel.classList.toggle("has-failures", failed > 0);
    els.writeProgressText.textContent = text;
    els.writeProgressPercent.textContent = `${percent}%`;
    els.writeProgressBar.style.width = `${percent}%`;
    const track = els.writeProgressPanel.querySelector(".write-progress-track");
    if (track) track.setAttribute("aria-valuenow", String(percent));
    if (els.writeProgressMeta) els.writeProgressMeta.textContent = failed
      ? t("progressMeta.writeFailed", { done: safeDone, total: safeTotal, failed })
      : `${safeDone}/${safeTotal}`;
    if (!message) setStatus(text);
  }

  function resetWriteProgress() {
    if (!els.writeProgressPanel || !els.writeProgressBar) return;
    hideWriteProgressSlot();
    els.writeProgressPanel.classList.remove("has-failures");
    els.writeProgressText.textContent = "";
    els.writeProgressPercent.textContent = "0%";
    els.writeProgressBar.style.width = "0%";
    if (els.writeProgressMeta) els.writeProgressMeta.textContent = "";
    const track = els.writeProgressPanel.querySelector(".write-progress-track");
    if (track) track.setAttribute("aria-valuenow", "0");
  }

  function hideAnalysisProgressSlot() {
    if (els.analysisProgressPanel) els.analysisProgressPanel.hidden = true;
  }

  function hideWriteProgressSlot() {
    if (els.writeProgressPanel) els.writeProgressPanel.hidden = true;
  }

  function readSettings() {
    const frequency = clampAndShowFrameRate();
    const maxTags = readInt(els.maxTags.value, 10, 1, 20);
    const aiRetryCount = readInt(els.aiRetryCount.value, AI_RETRY_COUNT, 0, 10);
    const requestChunkK = readInt(els.requestChunkK.value, DEFAULT_REQUEST_CHUNK_K, MIN_REQUEST_CHUNK_K, MAX_REQUEST_CHUNK_K);
    const autoConfidence = readFloat(els.autoConfidence.value, 0.8, 0, 1);
    const hideConfidence = Math.min(autoConfidence, readFloat(els.hideConfidence.value, 0.45, 0, 1));
    els.aiRetryCount.value = String(aiRetryCount);
    els.requestChunkK.value = String(requestChunkK);
    els.autoConfidence.value = String(autoConfidence);
    els.hideConfidence.value = String(hideConfidence);
    return {
      maxTags,
      concurrency: readInt(els.concurrency.value, 2, 1, 5),
      aiRetryCount,
      requestChunkK,
      autoConfidence,
      hideConfidence,
      frameStepSeconds: frequency.stepSeconds,
      maxVideoFrames: readInt(els.maxVideoFrames.value, 60, 1, 120),
      maxAnimatedFrames: readInt(els.maxAnimatedFrames.value, 24, 1, 120),
      skipStart: readFloat(els.skipStart.value, 0.2, 0, 10),
      skipEnd: readFloat(els.skipEnd.value, 0.2, 0, 10),
      skipTagged: els.skipTagged.checked,
      previewBeforeWrite: els.previewBeforeWrite.checked,
      autoApplyHighConfidence: els.autoApplyHighConfidence.checked,
      allowOutOfPoolSuggestions: els.allowOutOfPoolSuggestions.checked,
      globalPrompt: String(els.globalPrompt.value || "").trim(),
      writeAnnotation: els.writeAnnotation.checked,
      includeTitleInPrompt: els.includeTitleInPrompt.checked,
      diagnosticEnabled: els.diagnosticEnabled.checked,
      diagnosticDir: String(els.diagnosticDir.value || "").trim(),
      enabledBackends: ["eagle"],
      analysisPresetName: state.activePresetName
    };
  }

  function applyAnalysisPreset(name) {
    const presetName = String(name || "").trim();
    const preset = ANALYSIS_PRESETS[presetName];
    state.activePresetName = presetName;
    if (els.analysisPresetSelect) els.analysisPresetSelect.value = presetName;
    if (!preset) {
      saveSettings();
      renderPresetHint();
      return;
    }
    Object.keys(preset).forEach((key) => {
      if (!els[key]) return;
      if (els[key].type === "checkbox") {
        els[key].checked = Boolean(preset[key]);
      } else {
        els[key].value = String(preset[key]);
      }
    });
    clampAndShowFrameRate();
    saveSettings();
    refreshModelStatus();
    renderPresetHint();
    runHealthCheck({ silent: true });
    setStatus(`已应用分析预设：${presetName}`);
  }

  function renderPresetHint() {
    if (!els.presetHint) return;
    const presetName = state.activePresetName || "";
    if (!presetName) {
      els.presetHint.textContent = t("hint.preset");
      return;
    }
    els.presetHint.textContent = t("hint.currentPreset", { name: presetName });
  }

  function clampAndShowFrameRate() {
    let value = Number(els.frameRateValue.value);
    const unit = els.frameRateUnit.value;
    if (!Number.isFinite(value) || value <= 0) value = unit === "fps" ? 1 : 1;
    let stepSeconds = unit === "fps" ? 1 / value : value;
    stepSeconds = clampNumber(stepSeconds, 0.125, 3, 1);
    const clampedValue = unit === "fps" ? 1 / stepSeconds : stepSeconds;
    els.frameRateValue.value = String(roundTime(clampedValue));
    els.frameRateHint.textContent = t("hint.frameRateCurrent", { seconds: roundTime(stepSeconds) });
    return { stepSeconds };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      tagGroupName: state.selectedTagGroupName || "__all",
      maxTags: els.maxTags.value,
      concurrency: els.concurrency.value,
      aiRetryCount: els.aiRetryCount.value,
      requestChunkK: els.requestChunkK.value,
      autoConfidence: els.autoConfidence.value,
      hideConfidence: els.hideConfidence.value,
      frameRateValue: els.frameRateValue.value,
      frameRateUnit: els.frameRateUnit.value,
      maxVideoFrames: els.maxVideoFrames.value,
      maxAnimatedFrames: els.maxAnimatedFrames.value,
      skipStart: els.skipStart.value,
      skipEnd: els.skipEnd.value,
      skipTagged: els.skipTagged.checked,
      previewBeforeWrite: els.previewBeforeWrite.checked,
      autoApplyHighConfidence: els.autoApplyHighConfidence.checked,
      allowOutOfPoolSuggestions: els.allowOutOfPoolSuggestions.checked,
      globalPrompt: els.globalPrompt.value,
      writeAnnotation: els.writeAnnotation.checked,
      includeTitleInPrompt: els.includeTitleInPrompt.checked,
      diagnosticEnabled: els.diagnosticEnabled.checked,
      diagnosticDir: els.diagnosticDir.value,
      activePresetName: state.activePresetName,
      analysisPresetName: state.activePresetName
    }));
  }

  async function chooseDiagnosticDir() {
    try {
      const folder = await openDirectoryPicker();
      if (!folder) {
        setStatus("当前环境无法打开文件夹选择器，请手动粘贴本地文件夹路径。");
        return;
      }
      els.diagnosticDir.value = folder;
      saveSettings();
    } catch (error) {
      setStatus(`选择诊断目录失败：${formatError(error)}`);
    }
  }

  async function runHealthCheck(options = {}) {
    const settings = options.settings || readSettings();
    const model = Object.prototype.hasOwnProperty.call(options, "model")
      ? options.model
      : (settings.enabledBackends.includes("eagle") ? getAiModel() : null);
    state.healthStatus = await buildHealthStatus(settings, model);
    renderHealthStatus();
    if (!options.silent) {
      const blockers = state.healthStatus.filter((check) => check.blocking && !check.ok);
      setStatus(blockers.length ? `环境检查发现 ${blockers.length} 个阻断项。` : "环境检查完成，未发现阻断项。");
    }
    return state.healthStatus;
  }

  async function ensureHealthyBeforeAnalysis(settings, model) {
    const checks = await runHealthCheck({ silent: true, settings, model });
    const blockers = checks.filter((check) => check.blocking && !check.ok);
    if (!blockers.length) return true;
    openSettingsDrawer();
    activateSettingsTab("backend");
    setStatus(`开始分析前请先处理：${blockers.map((check) => check.label).join("、")}`);
    return false;
  }

  async function buildHealthStatus(settings, model) {
    const checks = [];
    const selectedNeedsFfmpeg = state.selectedItems.some(itemNeedsFfmpeg);
    const selectedNeedsFfprobe = state.selectedItems.some(itemNeedsFfprobe);

    checks.push({
      id: "node",
      label: "Node 能力",
      ok: Boolean(nodeRequire && fs && path),
      blocking: Boolean(selectedNeedsFfmpeg || settings.diagnosticEnabled),
      message: nodeRequire && fs && path ? "Node、fs、path 可用" : "当前插件环境缺少 Node.js 文件能力"
    });
    checks.push({
      id: "child_process",
      label: "child_process",
      ok: Boolean(cp && typeof cp.execFile === "function"),
      blocking: Boolean(selectedNeedsFfmpeg),
      message: cp && typeof cp.execFile === "function" ? "可调用 FFmpeg" : "无法调用 FFmpeg"
    });

    checks.push({
      id: "eagle-ai",
      label: "Eagle AI 模型",
      ok: Boolean(model),
      blocking: true,
      message: model ? "已配置默认视觉模型" : "未配置 Eagle 默认视觉模型"
    });

    checks.push(await checkFfmpegHealth(selectedNeedsFfmpeg, selectedNeedsFfprobe));
    checks.push(checkDiagnosticHealth(settings));
    checks.push(checkSelectedPathHealth());
    return checks.map(normalizeHealthCheck);
  }

  function normalizeHealthCheck(check) {
    const ok = Boolean(check && check.ok);
    const blocking = Boolean(check && check.blocking);
    return {
      id: check.id || check.label || "check",
      label: check.label || "检查项",
      ok,
      blocking,
      severity: ok ? "ok" : (blocking ? "fail" : "warn"),
      message: check.message || (ok ? "通过" : "需要处理"),
      command: check.command || ""
    };
  }

  async function checkFfmpegHealth(required, requireFfprobe = required) {
    if (!required) {
      return {
        id: "ffmpeg",
        label: "FFmpeg",
        ok: true,
        blocking: false,
        message: "当前素材不需要抽帧"
      };
    }
    const ffmpeg = getFfmpegApi();
    if (!ffmpeg) {
      return {
        id: "ffmpeg",
        label: "FFmpeg",
        ok: false,
        blocking: true,
        message: "未检测到 Eagle FFmpeg 扩展"
      };
    }
    try {
      if (typeof ffmpeg.isInstalled === "function" && !await ffmpeg.isInstalled()) {
        return { id: "ffmpeg", label: "FFmpeg", ok: false, blocking: true, message: "Eagle FFmpeg 扩展未安装" };
      }
      if (ffmpeg.isInstalled === false) {
        return { id: "ffmpeg", label: "FFmpeg", ok: false, blocking: true, message: "Eagle FFmpeg 扩展未安装" };
      }
      const paths = typeof ffmpeg.getPaths === "function" ? await ffmpeg.getPaths() : ffmpeg.paths;
      const ok = Boolean(paths && paths.ffmpeg && (!requireFfprobe || paths.ffprobe));
      return {
        id: "ffmpeg",
        label: "FFmpeg",
        ok,
        blocking: true,
        message: ok ? (requireFfprobe ? "FFmpeg/ffprobe 路径可用" : "FFmpeg 路径可用") : (requireFfprobe ? "无法读取 FFmpeg/ffprobe 路径" : "无法读取 FFmpeg 路径")
      };
    } catch (error) {
      return {
        id: "ffmpeg",
        label: "FFmpeg",
        ok: false,
        blocking: true,
        message: formatError(error)
      };
    }
  }

  function checkDiagnosticHealth(settings) {
    if (!settings.diagnosticEnabled) {
      return {
        id: "diagnostic",
        label: "诊断目录",
        ok: true,
        blocking: false,
        message: "未启用诊断保存"
      };
    }
    if (!settings.diagnosticDir) {
      return {
        id: "diagnostic",
        label: "诊断目录",
        ok: false,
        blocking: true,
        message: "已开启诊断保存，但尚未选择文件夹"
      };
    }
    if (!fs || !path) {
      return {
        id: "diagnostic",
        label: "诊断目录",
        ok: false,
        blocking: true,
        message: "缺少 Node.js 文件能力，无法写入诊断目录"
      };
    }
    try {
      fs.mkdirSync(settings.diagnosticDir, { recursive: true });
      const probe = path.join(settings.diagnosticDir, `.vfx-ai-tagger-health-${Date.now()}.tmp`);
      fs.writeFileSync(probe, "ok", "utf8");
      fs.rmSync(probe, { force: true });
      return {
        id: "diagnostic",
        label: "诊断目录",
        ok: true,
        blocking: true,
        message: "诊断目录可写"
      };
    } catch (error) {
      return {
        id: "diagnostic",
        label: "诊断目录",
        ok: false,
        blocking: true,
        message: formatError(error)
      };
    }
  }

  function checkSelectedPathHealth() {
    if (!state.selectedItems.length) {
      return {
        id: "selected-paths",
        label: "素材路径",
        ok: true,
        blocking: false,
        message: "尚未导入素材，开始分析前会再次检查"
      };
    }
    const missing = state.selectedItems.filter((item) => {
      const candidates = [getItemFilePath(item), getItemPreviewPath(item)]
        .map((candidate) => candidate && fileUrlToPath(candidate))
        .filter(Boolean);
      if (!candidates.length) return true;
      return Boolean(fs && !candidates.some((candidate) => fs.existsSync(candidate)));
    });
    return {
      id: "selected-paths",
      label: "素材路径",
      ok: missing.length === 0,
      blocking: true,
      message: missing.length
        ? `${missing.length} 个素材路径不存在或不可访问`
        : `${state.selectedItems.length} 个素材路径可访问`
    };
  }

  function itemNeedsFfmpeg(item) {
    const filePath = getItemFilePath(item);
    const ext = getItemExt(item, filePath);
    if (CONVERTIBLE_IMAGE_EXTS.has(ext)) return true;
    if (VIDEO_EXTS.has(ext) || ANIMATED_EXTS.has(ext)) return true;
    if (ext === WEBP_EXT) return hasFileMarkerSync(filePath, "ANIM", 65536);
    if (ext === "png") return hasFileMarkerSync(filePath, "acTL", 4096);
    return false;
  }

  function itemNeedsFfprobe(item) {
    const filePath = getItemFilePath(item);
    const ext = getItemExt(item, filePath);
    if (VIDEO_EXTS.has(ext) || ANIMATED_EXTS.has(ext)) return true;
    if (ext === WEBP_EXT) return hasFileMarkerSync(filePath, "ANIM", 65536);
    if (ext === "png") return hasFileMarkerSync(filePath, "acTL", 4096);
    return false;
  }

  function renderHealthStatus() {
    if (!els.healthStatusList || !els.healthSummary) return;
    const checks = Array.isArray(state.healthStatus) ? state.healthStatus : [];
    const blockers = checks.filter((check) => check.blocking && !check.ok);
    els.healthSummary.textContent = checks.length
      ? (blockers.length ? t("health.blockingCount", { count: blockers.length }) : t("health.available"))
      : t("health.waiting");
    els.healthStatusList.innerHTML = checks.map((check) => `
      <div class="health-item ${escapeHtml(check.severity)}">
        <strong>${check.ok ? t("health.pass") : (check.blocking ? t("health.blocking") : t("health.warning"))}</strong>
        <span>${escapeHtml(check.label)}：${escapeHtml(check.message)}</span>
      </div>
    `).join("");
  }

  async function openDirectoryPicker() {
    const dialog = getElectronDialog();
    if (dialog && typeof dialog.showOpenDialog === "function") {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      const filePaths = result && result.filePaths;
      return Array.isArray(filePaths) && filePaths.length ? filePaths[0] : "";
    }
    const eagleDialog = window.eagle && eagle.dialog;
    if (eagleDialog && typeof eagleDialog.showOpenDialog === "function") {
      const result = await eagleDialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
      if (Array.isArray(result)) return result[0] || "";
      const filePaths = result && result.filePaths;
      return Array.isArray(filePaths) && filePaths.length ? filePaths[0] : "";
    }
    return "";
  }

  function getElectronDialog() {
    if (!nodeRequire) return null;
    try {
      const electron = nodeRequire("electron");
      return electron && ((electron.remote && electron.remote.dialog) || electron.dialog);
    } catch (error) {
      try {
        const remote = nodeRequire("@electron/remote");
        return remote && remote.dialog;
      } catch (remoteError) {
        return null;
      }
    }
  }

  function ensureDiagnosticSettings(settings) {
    if (!settings.diagnosticEnabled) return true;
    if (!settings.diagnosticDir) {
      setStatus("已开启诊断保存，请先选择诊断保存文件夹。");
      return false;
    }
    if (!fs || !path) {
      setStatus("当前插件环境缺少 Node.js 能力，无法验证诊断保存文件夹。");
      return false;
    }
    try {
      fs.mkdirSync(settings.diagnosticDir, { recursive: true });
      const stat = fs.statSync(settings.diagnosticDir);
      if (!stat.isDirectory()) throw new Error("不是文件夹");
      return true;
    } catch (error) {
      setStatus(`诊断保存文件夹不可用：${formatError(error)}`);
      return false;
    }
  }

  function loadStoredState() {
    state.customAllowedTags = readJsonArray(STORAGE_KEYS.customAllowedTags);
    state.disabledTags = readJsonArray(STORAGE_KEYS.disabledTags);
    state.defaultTemplateTags = loadDefaultTemplateTags();
    state.undoStack = readStoredUndoStack();
    state.results = readStoredResults();
    state.paused = state.results.some((result) => result.status === "pending");
    const settings = readJsonObject(STORAGE_KEYS.settings);
    state.selectedTagGroupName = settings.tagGroupName || "__all";
    Object.keys(settings).forEach((key) => {
      if (!els[key]) return;
      if (els[key].type === "checkbox") {
        els[key].checked = coerceStoredBoolean(settings[key], els[key].checked);
      } else {
        els[key].value = settings[key];
      }
    });
    state.activePresetName = settings.analysisPresetName || settings.activePresetName || "";
    if (els.analysisPresetSelect) els.analysisPresetSelect.value = state.activePresetName;
    renderPresetHint();
  }

  function coerceStoredBoolean(value, fallback) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    }
    return Boolean(fallback);
  }

  function saveStoredTagState() {
    localStorage.setItem(STORAGE_KEYS.customAllowedTags, JSON.stringify(state.customAllowedTags));
    localStorage.setItem(STORAGE_KEYS.disabledTags, JSON.stringify(state.disabledTags));
  }

  function loadDefaultTemplateTags() {
    const raw = localStorage.getItem(STORAGE_KEYS.defaultTemplateTags);
    if (raw === null) return normalizeTagList(DEFAULT_VFX_TAGS);
    try {
      const parsed = JSON.parse(raw);
      return normalizeTagList(Array.isArray(parsed) ? parsed : DEFAULT_VFX_TAGS);
    } catch (error) {
      return normalizeTagList(DEFAULT_VFX_TAGS);
    }
  }

  function getDefaultTemplateTags() {
    return normalizeTagList(state.defaultTemplateTags);
  }

  function saveDefaultTemplateTags() {
    state.defaultTemplateTags = normalizeTagList(state.defaultTemplateTags);
    localStorage.setItem(STORAGE_KEYS.defaultTemplateTags, JSON.stringify(state.defaultTemplateTags));
  }

  function saveResultsState() {
    try {
      const results = state.results.map((result) => ({
        id: result.id,
        name: result.name,
        status: result.status === "running" ? "pending" : result.status,
        message: result.message,
        tags: result.tags,
        autoTags: result.autoTags,
        reviewTags: result.reviewTags,
        aiReason: result.aiReason,
        aiBackend: result.aiBackend,
        frameCount: result.frameCount,
        requestCount: result.requestCount,
        mediaChunkCount: result.mediaChunkCount,
        tagChunkCount: result.tagChunkCount,
        diagnosticPath: result.diagnosticPath,
        diagnostics: null,
        filteredTags: result.filteredTags,
        hiddenCount: result.hiddenCount,
        confidence: result.confidence,
        errorType: result.errorType
      }));
      localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(results));
    } catch (error) {
      // Result cache is a recovery aid. Analysis/write flow should continue if storage is full.
    }
  }

  function saveUndoStack() {
    try {
      const records = state.undoStack
        .slice(-50)
        .map((record) => ({
          itemId: String(record.itemId || ""),
          addedTags: normalizeTagList(record.addedTags || []),
          previousAnnotation: String(record.previousAnnotation || ""),
          source: String(record.source || "写入标签"),
          at: Number(record.at) || Date.now()
        }))
        .filter((record) => record.itemId);
      localStorage.setItem(STORAGE_KEYS.undoStack, JSON.stringify(records));
    } catch (error) {
      // Undo persistence is a safety net. Write flow should continue if storage is full.
    }
  }

  function readStoredUndoStack() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.undoStack) || "[]");
      if (!Array.isArray(value)) return [];
      return value
        .filter((record) => record && typeof record === "object" && record.itemId)
        .map((record) => ({
          itemId: String(record.itemId || ""),
          addedTags: normalizeTagList(record.addedTags || []),
          previousAnnotation: String(record.previousAnnotation || ""),
          source: String(record.source || "写入标签"),
          at: Number(record.at) || 0
        }));
    } catch (error) {
      return [];
    }
  }

  function readStoredResults() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.results) || "[]");
      if (!Array.isArray(value)) return [];
      return value
        .filter((result) => result && typeof result === "object" && result.id)
        .map((result) => ({
          ...createStoredResultSkeleton(result),
          ...result,
          status: result.status === "running" ? "pending" : result.status
        }));
    } catch (error) {
      return [];
    }
  }

  function createStoredResultSkeleton(result) {
    return {
      id: String(result.id || ""),
      name: String(result.name || "未命名素材"),
      status: "pending",
      message: "从上次会话恢复",
      tags: [],
      autoTags: [],
      reviewTags: [],
      aiReason: "",
      aiBackend: "",
      frameCount: 0,
      requestCount: 0,
      mediaChunkCount: 0,
      tagChunkCount: 0,
      diagnosticPath: "",
      diagnostics: null,
      filteredTags: [],
      hiddenCount: 0,
      confidence: 0,
      errorType: ""
    };
  }

  function renderAll() {
    renderTagGroupSelect();
    renderTagPool();
    renderSelectedSummary();
    renderSelectedItems();
    renderSelectedFullList();
    renderResults();
    updateCollectorBar();
    els.selectedCount.textContent = String(state.selectedItems.length);
    els.tagPoolCount.textContent = String(getAllowedTags().length);
  }

  function updateCollectorBar() {
    if (els.collectorCount) {
      els.collectorCount.textContent = `${state.selectedItems.length} 个待分析`;
    }
    if (els.collectorAnalyzeBtn) {
      els.collectorAnalyzeBtn.disabled = state.running || state.writing || !state.selectedItems.length;
    }
    if (els.collectorAppendBtn) {
      els.collectorAppendBtn.disabled = state.running || state.writing;
    }
    if (els.collectorClearBtn) {
      els.collectorClearBtn.disabled = state.running || state.writing || (!state.selectedItems.length && !state.results.length);
    }
    if (els.clearSelectedBtn) {
      els.clearSelectedBtn.disabled = state.running || state.writing || (!state.selectedItems.length && !state.results.length);
    }
    if (els.appendSelectedBtn) els.appendSelectedBtn.disabled = state.running || state.writing;
    if (els.replaceSelectedBtn) els.replaceSelectedBtn.disabled = state.running || state.writing;
    if (els.miniCollectorBtn) els.miniCollectorBtn.disabled = state.running || state.writing;
  }

  function renderSelectedSummary() {
    if (!els.selectedSummary) return;
    const total = state.selectedItems.length;
    const withTags = state.selectedItems.filter((item) => Array.isArray(item.tags) && item.tags.length).length;
    const pending = state.results.filter((result) => result.status === "pending" || result.status === "running").length;
    const failed = state.results.filter((result) => result.status === "failed").length;
    els.selectedSummary.innerHTML = [
      `<span>已导入 ${total} 个</span>`,
      `<span>已有标签 ${withTags} 个</span>`,
      pending ? `<span>待处理 ${pending} 个</span>` : "",
      failed ? `<span>失败 ${failed} 个</span>` : ""
    ].filter(Boolean).join("");
    if (els.showSelectedListBtn) els.showSelectedListBtn.disabled = total === 0;
  }

  function renderSelectedItems() {
    if (!els.selectedItems) return;
    els.selectedItems.innerHTML = "";
    if (!state.selectedItems.length) {
      els.selectedItems.innerHTML = `<div class="empty">请先在 Eagle 中选择素材，然后点击“追加当前选中”。</div>`;
      return;
    }
    const hasOverflow = state.selectedItems.length > SELECTED_TRAY_LIMIT;
    const visibleItems = hasOverflow
      ? state.selectedItems.slice(0, SELECTED_TRAY_LIMIT - 1)
      : state.selectedItems.slice(0, SELECTED_TRAY_LIMIT);
    visibleItems.forEach((item) => {
      els.selectedItems.appendChild(createSelectedItemCard(item, { compact: true }));
    });
    if (hasOverflow) {
      const remainingCount = state.selectedItems.length - visibleItems.length;
      els.selectedItems.appendChild(createSelectedExpandCard(remainingCount));
    }
  }

  function renderSelectedFullList() {
    if (!els.selectedItemsFullList) return;
    els.selectedItemsFullList.innerHTML = "";
    if (!state.selectedItems.length) {
      els.selectedItemsFullList.innerHTML = `<div class="empty">还没有导入素材。</div>`;
      return;
    }
    state.selectedItems.forEach((item) => {
      els.selectedItemsFullList.appendChild(createSelectedItemCard(item, { compact: false }));
    });
  }

  function createSelectedItemCard(item, options = {}) {
    const compact = Boolean(options.compact);
    const filePath = getItemFilePath(item);
    const ext = getItemExt(item, filePath) || "未知";
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const previewPath = getItemPreviewPath(item);
    const previewUrl = previewPath ? toFileUrl(previewPath) : "";
    const card = document.createElement("div");
    card.className = compact ? "selected-card is-compact" : "selected-card";
    card.setAttribute("data-item-id", getItemId(item));
    card.innerHTML = `
      <div class="selected-thumb" aria-hidden="true">
        ${previewUrl ? `<img src="${escapeHtml(previewUrl)}" alt="">` : `<span>${escapeHtml(ext.toUpperCase().slice(0, 4))}</span>`}
      </div>
      <div class="selected-item-main">
        <div class="selected-name" title="${escapeHtml(getItemName(item))}">${escapeHtml(getItemName(item))}</div>
        <div class="selected-meta">
          <span>${escapeHtml(ext.toUpperCase())}</span>
          <span>${tags.length} 个已有标签</span>
          ${compact ? "" : `<span title="${escapeHtml(filePath)}">${escapeHtml(shortPath(filePath))}</span>`}
        </div>
      </div>
      <div class="selected-card-actions">
        <button class="selected-preview-btn" type="button" data-preview-item="${escapeHtml(getItemId(item))}">预览</button>
        <button class="selected-remove-btn" type="button" data-remove-selected-item="${escapeHtml(getItemId(item))}" aria-label="移除 ${escapeHtml(getItemName(item))}" title="移除">
          <svg class="selected-trash-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M6 7l1 14h10l1-14"></path>
            <path d="M9 7V4h6v3"></path>
          </svg>
        </button>
      </div>
    `;
    return card;
  }

  function createSelectedExpandCard(remainingCount) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "selected-expand-card";
    button.addEventListener("click", openSelectedListDialog);
    button.innerHTML = `
      <strong>展开全部</strong>
      <span>+${remainingCount} 个素材</span>
    `;
    return button;
  }

  function createSelectedItemRow(item) {
    return createSelectedItemCard(item, { compact: false });
  }

  function renderTagPool() {
    const query = cleanTag(els.tagSearch.value).toLowerCase();
    const tags = getAllowedTags().filter((tag) => !query || tag.toLowerCase().includes(query));
    els.tagPool.innerHTML = "";
    if (!tags.length) {
      els.tagPool.innerHTML = `<div class="empty">标签池为空</div>`;
      return;
    }
    tags.forEach((tag) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";
      chip.setAttribute("data-pool-tag", tag);
      chip.innerHTML = `<span title="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "从候选池移除";
      remove.addEventListener("click", () => removeFromPool(tag));
      chip.appendChild(remove);
      els.tagPool.appendChild(chip);
    });
  }

  function renderTagGroupSelect() {
    if (!els.tagGroupSelect) return;
    const groupNames = [...new Set(state.eagleTagGroups.map(getTagGroupName).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    const currentValue = groupNames.includes(state.selectedTagGroupName) ? state.selectedTagGroupName : "__all";
    if (currentValue !== state.selectedTagGroupName) {
      state.selectedTagGroupName = currentValue;
      applyTagGroupFilter();
    }
    els.tagGroupSelect.innerHTML = [
      `<option value="__all">全部 Eagle 标签</option>`,
      ...groupNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    ].join("");
    els.tagGroupSelect.value = currentValue;
  }

  function renderResults() {
    const readyCount = state.results.filter((result) => result.status === "ready" && getSelectedReviewTags(result).length).length;
    const failedCount = state.results.filter((result) => result.status === "failed" || result.status === "skipped").length;
    els.readyCount.textContent = String(readyCount);
    els.failedCount.textContent = String(failedCount);
    els.applyBtn.disabled = !canWriteReadyResults() || readyCount === 0;
    els.undoBtn.disabled = state.running || state.writing || state.undoStack.length === 0;
    if (els.retryFailedBtn) els.retryFailedBtn.disabled = state.running || state.writing || !state.results.some((result) => result.status === "failed");
    updateResultFilterButtons();
    updateAnalysisControls();
    syncMediaPreviewAfterResultsChange();
    els.results.innerHTML = "";
    if (!state.results.length) {
      els.results.innerHTML = `<div class="empty">追加当前选中素材后点击“开始分析”，这里会显示待确认标签、置信度和写入状态。</div>`;
      return;
    }
    const visibleResults = getFilteredResults();
    if (!visibleResults.length) {
      els.results.innerHTML = `<div class="empty">当前过滤条件下没有结果。</div>`;
      return;
    }
    visibleResults.forEach((result) => {
      const item = document.createElement("article");
      item.className = "result";
      item.setAttribute("data-result-id", result.id);
      item.innerHTML = `
        <div class="result-head">
          <div class="result-title">
            <div class="result-name" title="${escapeHtml(result.name)}">${escapeHtml(result.name)}</div>
            <div class="result-meta">
              <span class="result-state ${escapeHtml(result.status)}">${stateLabel(result.status)}</span>
              ${result.aiBackend ? `<span class="badge">${escapeHtml(formatBackendLabel(result.aiBackend))}</span>` : ""}
              ${typeof result.confidence === "number" ? `<span class="badge">整体 ${formatConfidence(result.confidence)}</span>` : ""}
              ${result.frameCount ? `<span class="badge">${escapeHtml(String(result.frameCount))} 张图像</span>` : ""}
              ${result.requestCount > 1 ? `<span class="badge">${escapeHtml(String(result.requestCount))} 次请求</span>` : ""}
            </div>
          </div>
          <div class="result-actions">
            <button type="button" data-preview-result="${escapeHtml(result.id)}">预览</button>
            <button type="button" data-reanalyze-result="${escapeHtml(result.id)}" ${state.running ? "disabled" : ""}>重新分析</button>
          </div>
        </div>
        <div class="result-summary">
          ${result.message ? `<div class="result-message">${escapeHtml(result.message)}</div>` : ""}
          ${result.errorType ? `<div class="failure-type">失败类型：${escapeHtml(failureTypeLabel(result.errorType))}</div>` : ""}
          ${result.diagnosticPath ? `<div class="diagnostic-saved">诊断文件已保存：${escapeHtml(result.diagnosticPath)}</div>` : ""}
        </div>
        ${renderAutoTags(result.autoTags)}
        ${renderReviewTags(result)}
        ${renderResultEditor(result)}
        ${result.aiReason ? `<div class="result-reason">AI 说明：${escapeHtml(result.aiReason)}</div>` : ""}
        ${result.filteredTags && result.filteredTags.length ? `<div class="filtered">已过滤：${escapeHtml(result.filteredTags.join("、"))}</div>` : ""}
        ${result.hiddenCount ? `<div class="muted">${result.hiddenCount} 个低置信标签已隐藏</div>` : ""}
        ${renderDiagnostics(result.diagnostics)}
      `;
      els.results.appendChild(item);
    });
    els.results.querySelectorAll("[data-review-tag]").forEach((input) => {
      input.addEventListener("change", () => toggleReviewTag(input.dataset.resultId, input.dataset.reviewTag, input.checked));
    });
    els.results.querySelectorAll("[data-remove-review-tag]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeReviewTag(button.dataset.resultId, button.dataset.removeReviewTag);
      });
    });
    els.results.querySelectorAll("[data-add-manual-tag]").forEach((button) => {
      button.addEventListener("click", () => addManualTagToResult(button.dataset.addManualTag));
    });
    els.results.querySelectorAll("[data-manual-tag-input]").forEach((input) => {
      input.addEventListener("focus", () => renderManualTagSuggestions(input.dataset.manualTagInput));
      input.addEventListener("input", () => renderManualTagSuggestions(input.dataset.manualTagInput));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addManualTagToResult(input.dataset.manualTagInput);
        }
        if (event.key === "Escape") closeManualTagMenus();
      });
    });
    els.results.querySelectorAll("[data-manual-tag-menu]").forEach((menu) => {
      menu.addEventListener("mousedown", (event) => {
        const option = event.target.closest("[data-manual-tag-option]");
        if (!option) return;
        event.preventDefault();
        selectManualTagSuggestion(menu.dataset.manualTagMenu, option.dataset.manualTagOption);
      });
    });
    els.results.querySelectorAll("[data-reanalyze-result]").forEach((button) => {
      button.addEventListener("click", () => reanalyzeResult(button.dataset.reanalyzeResult));
    });
    if (state.mediaPreview.open) refreshMediaPreviewReview();
  }

  function syncMediaPreviewAfterResultsChange() {
    if (!state.mediaPreview.open || !state.mediaPreview.resultId) return;
    const resultId = state.mediaPreview.resultId;
    const exists = state.results.some((result) => result.id === resultId);
    const visible = getFilteredResults().some((result) => result.id === resultId);
    if (!exists || !visible) closeMediaPreview();
  }

  function syncMediaPreviewAfterSelectedItemsChange() {
    if (!state.mediaPreview.open) return;
    const activeId = state.mediaPreview.itemId || state.mediaPreview.resultId;
    if (!activeId) return;
    const exists = state.selectedItems.some((item) => getItemId(item) === activeId);
    if (!exists) closeMediaPreview();
  }

  function getFilteredResults() {
    const filter = state.activeResultFilter || "all";
    if (filter === "all") return state.results;
    if (filter === "ready") return state.results.filter((result) => result.status === "ready");
    if (filter === "failed") return state.results.filter((result) => result.status === "failed");
    if (filter === "applied") return state.results.filter((result) => result.status === "applied");
    if (filter === "skipped") return state.results.filter((result) => result.status === "skipped");
    return state.results;
  }

  function updateResultFilterButtons() {
    if (!els.resultFilterButtons) return;
    els.resultFilterButtons.forEach((button) => {
      button.classList.toggle("is-active", (button.dataset.resultFilter || "all") === (state.activeResultFilter || "all"));
    });
  }

  function renderDiagnostics(diagnostics) {
    if (!diagnostics || !Array.isArray(diagnostics.images) || !diagnostics.images.length) return "";
    const images = diagnostics.images.slice(0, DIAGNOSTIC_PREVIEW_LIMIT);
    return `
      <details class="diagnostics">
        <summary>诊断信息</summary>
        <div class="diagnostic-line">原文件：${escapeHtml(shortPath(diagnostics.sourcePath || ""))}</div>
        <div class="diagnostic-line">预览图：${escapeHtml(shortPath(diagnostics.previewPath || ""))}</div>
        ${diagnostics.diagnosticPath ? `<div class="diagnostic-line">诊断目录：${escapeHtml(diagnostics.diagnosticPath)}</div>` : ""}
        <div class="diagnostic-line">实际图片：${diagnostics.images.length} 张，显示前 ${images.length} 张</div>
        <div class="diagnostic-grid">
          ${images.map((image, index) => `
            <figure class="diagnostic-frame">
              ${image.exists ? `<img src="${escapeHtml(image.previewUrl || image.url)}" alt="frame ${index + 1}">` : `<div class="diagnostic-missing">不存在</div>`}
              <figcaption>${index + 1} · ${image.exists ? "存在" : "缺失"} · ${formatBytes(image.size)}</figcaption>
            </figure>
          `).join("")}
        </div>
      </details>
    `;
  }

  function renderAutoTags(tags) {
    if (!Array.isArray(tags) || !tags.length) return "";
    return `
      <div class="tag-section-title">已自动写入</div>
      <div class="result-tags auto-tags">
        ${tags.map((tag) => `<span class="tag-chip"><span>${escapeHtml(tag.name)} ${formatConfidence(tag.confidence)}</span></span>`).join("")}
      </div>
    `;
  }

  function renderReviewTags(result) {
    if (!Array.isArray(result.reviewTags) || !result.reviewTags.length) return "";
    return `
      <div class="tag-section-title">待确认</div>
      <div class="review-tags">
        ${result.reviewTags.map((tag) => `
          <label class="${escapeHtml(reviewTagClassName(tag))}" data-result-id="${escapeHtml(result.id)}" data-review-tag-name="${escapeHtml(tag.name)}">
            <input type="checkbox" data-result-id="${escapeHtml(result.id)}" data-review-tag="${escapeHtml(tag.name)}" ${tag.selected ? "checked" : ""}>
            <span>${escapeHtml(tag.name)}</span>
            ${renderReviewTagSourceBadge(tag)}
            <strong>${escapeHtml(reviewTagMetaText(tag))}</strong>
            <button class="review-tag-remove" type="button" data-result-id="${escapeHtml(result.id)}" data-remove-review-tag="${escapeHtml(tag.name)}" title="删除标签">×</button>
          </label>
        `).join("")}
      </div>
    `;
  }

  function reviewTagClassName(tag) {
    return [
      "review-tag",
      tag && tag.source === "manual" ? "manual" : "",
      tag && tag.source === "template" ? "template-gap" : ""
    ].filter(Boolean).join(" ");
  }

  function renderReviewTagSourceBadge(tag) {
    if (!tag || tag.source !== "template") return "";
    return `<span class="review-tag-source-add" title="来自默认模板，当前标签池中不存在" aria-label="默认模板新增"></span>`;
  }

  function reviewTagMetaText(tag) {
    return tag && tag.source === "manual" ? "人工" : formatConfidence(tag && tag.confidence);
  }

  function renderResultEditor(result) {
    if (["pending", "running"].includes(result.status)) return "";
    const menuId = `manual-tag-menu-${safeDomId(result.id)}`;
    return `
      <div class="result-editor">
        <input type="search" data-manual-tag-input="${escapeHtml(result.id)}" aria-controls="${escapeHtml(menuId)}" aria-expanded="false" autocomplete="off" placeholder="搜索或输入标签">
        <button type="button" data-add-manual-tag="${escapeHtml(result.id)}">添加标签</button>
        <div id="${escapeHtml(menuId)}" class="manual-tag-menu" data-manual-tag-menu="${escapeHtml(result.id)}" hidden></div>
      </div>
    `;
  }

  function getManualTagInput(resultId) {
    return Array.from(els.results.querySelectorAll("[data-manual-tag-input]"))
      .find((candidate) => candidate.dataset.manualTagInput === resultId);
  }

  function getManualTagMenu(resultId) {
    return Array.from(els.results.querySelectorAll("[data-manual-tag-menu]"))
      .find((candidate) => candidate.dataset.manualTagMenu === resultId);
  }

  function renderManualTagSuggestions(resultId) {
    const input = getManualTagInput(resultId);
    const menu = getManualTagMenu(resultId);
    const result = state.results.find((item) => item.id === resultId);
    if (!input || !menu || !result) return;
    const query = cleanTag(input.value);
    const selected = new Set((Array.isArray(result.reviewTags) ? result.reviewTags : []).map((tag) => tag.name));
    const matches = getAllowedTags()
      .filter((tag) => !selected.has(tag))
      .filter((tag) => !query || tag.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 12);
    const canCreate = query && !selected.has(query) && !matches.some((tag) => tag === query);
    const createOption = canCreate
      ? `<button type="button" class="manual-tag-option create" data-manual-tag-option="${escapeHtml(query)}"><span>新增“${escapeHtml(query)}”</span><small>加入本次标签池</small></button>`
      : "";
    const matchOptions = matches.map((tag) => `
      <button type="button" class="manual-tag-option" data-manual-tag-option="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span>
        <small>${state.eagleTags.includes(tag) ? "Eagle 标签" : "本次标签"}</small>
      </button>
    `).join("");
    if (!createOption && !matchOptions) {
      closeManualTagMenu(resultId);
      return;
    }
    menu.innerHTML = `${createOption}${matchOptions}`;
    menu.hidden = false;
    menu.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
    positionManualTagMenu(input, menu);
  }

  function positionManualTagMenu(input, menu) {
    const rect = input.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1180;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 760;
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - margin * 2);
    menu.style.width = `${Math.round(width)}px`;
    menu.style.left = `${Math.round(clampNumber(rect.left, margin, viewportWidth - width - margin, margin))}px`;
    const maxHeight = Math.min(260, Math.max(120, viewportHeight - margin * 2));
    menu.style.maxHeight = `${Math.round(maxHeight)}px`;
    const menuHeight = Math.min(menu.scrollHeight || maxHeight, maxHeight);
    const belowTop = rect.bottom + 6;
    const aboveTop = rect.top - menuHeight - 6;
    const top = belowTop + menuHeight <= viewportHeight - margin ? belowTop : Math.max(margin, aboveTop);
    menu.style.top = `${Math.round(top)}px`;
  }

  function selectManualTagSuggestion(resultId, tagName) {
    const input = getManualTagInput(resultId);
    if (input) input.value = tagName || "";
    addManualTagToResult(resultId);
  }

  function closeManualTagMenu(resultId) {
    const menu = getManualTagMenu(resultId);
    const input = getManualTagInput(resultId);
    if (menu) {
      menu.hidden = true;
      menu.classList.remove("is-open");
      menu.innerHTML = "";
    }
    if (input) input.setAttribute("aria-expanded", "false");
  }

  function closeManualTagMenus() {
    els.results.querySelectorAll("[data-manual-tag-menu]").forEach((menu) => {
      closeManualTagMenu(menu.dataset.manualTagMenu);
    });
  }

  function getPreviewManualTagInput(resultId) {
    return Array.from(els.mediaPreviewTags.querySelectorAll("[data-preview-manual-tag-input]"))
      .find((candidate) => candidate.dataset.previewManualTagInput === resultId);
  }

  function getPreviewManualTagMenu(resultId) {
    return Array.from(els.mediaPreviewTags.querySelectorAll("[data-preview-manual-tag-menu]"))
      .find((candidate) => candidate.dataset.previewManualTagMenu === resultId);
  }

  function updatePreviewManualTagMenu(resultId) {
    const input = getPreviewManualTagInput(resultId);
    const menu = getPreviewManualTagMenu(resultId);
    const result = state.results.find((item) => item.id === resultId);
    if (!input || !menu || !result) return;
    const query = cleanTag(input.value);
    const selected = new Set((Array.isArray(result.reviewTags) ? result.reviewTags : []).map((tag) => tag.name));
    const matches = getAllowedTags()
      .filter((tag) => !selected.has(tag))
      .filter((tag) => !query || tag.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 12);
    const canCreate = query && !selected.has(query) && !matches.some((tag) => tag === query);
    const createOption = canCreate
      ? `<button type="button" class="manual-tag-option create" data-manual-tag-option="${escapeHtml(query)}"><span>新增“${escapeHtml(query)}”</span><small>加入本次标签池</small></button>`
      : "";
    const matchOptions = matches.map((tag) => `
      <button type="button" class="manual-tag-option" data-manual-tag-option="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span>
        <small>${state.eagleTags.includes(tag) ? "Eagle 标签" : "本次标签"}</small>
      </button>
    `).join("");
    if (!createOption && !matchOptions) {
      closePreviewManualTagMenu(resultId);
      return;
    }
    menu.innerHTML = `${createOption}${matchOptions}`;
    menu.hidden = false;
    menu.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
    positionManualTagMenu(input, menu);
  }

  function closePreviewManualTagMenu(resultId) {
    const menu = getPreviewManualTagMenu(resultId);
    const input = getPreviewManualTagInput(resultId);
    if (menu) {
      menu.hidden = true;
      menu.classList.remove("is-open");
      menu.innerHTML = "";
    }
    if (input) input.setAttribute("aria-expanded", "false");
  }

  function closePreviewManualTagMenus() {
    if (!els.mediaPreviewTags) return;
    els.mediaPreviewTags.querySelectorAll("[data-preview-manual-tag-menu]").forEach((menu) => {
      closePreviewManualTagMenu(menu.dataset.previewManualTagMenu);
    });
  }

  function addPreviewManualTagToResult(resultId, tagName) {
    const input = getPreviewManualTagInput(resultId);
    tagName = cleanTag(tagName || (input && input.value));
    addManualTagToResult(resultId, tagName);
    closePreviewManualTagMenu(resultId);
  }

  async function retryFailedResults() {
    if (state.running) return;
    const failedIds = state.results.filter((result) => result.status === "failed").map((result) => result.id);
    if (!failedIds.length) {
      setStatus("没有失败项需要重试。");
      return;
    }
    const failedSet = new Set(failedIds);
    state.results = state.results.map((result) => failedSet.has(result.id)
      ? { ...createPendingResult({ id: result.id, name: result.name }), message: "等待重试" }
      : result);
    state.paused = false;
    saveResultsState();
    renderResults();
    setStatus(`准备重试 ${failedIds.length} 个失败项。`);
    await analyzeSelected();
  }

  async function reanalyzeResult(resultId) {
    if (state.running) return;
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === resultId);
    if (!item) {
      setStatus("找不到这个素材，请重新导入当前选中素材后再试。");
      return;
    }
    const settings = readSettings();
    const baseAllowedTags = getAllowedTags();
    const allowedTags = getAnalysisAllowedTags(baseAllowedTags, settings);
    if (!allowedTags.length) {
      setStatus("标签池为空，请先刷新 Eagle 标签或导入默认模板。");
      return;
    }
    const model = getAiModel();
    if (!await ensureHealthyBeforeAnalysis(settings, model)) return;
    const usableBackends = getUsableBackends(settings, model);
    if (!usableBackends.length) {
      setStatus("没有可用 AI 模型：请先配置 Eagle 默认视觉模型。");
      return;
    }
    settings.enabledBackends = usableBackends;
    if (!ensureDiagnosticSettings(settings)) return;
    state.running = true;
    state.pauseRequested = false;
    setControlsBusy(true);
    updateResult(resultId, {
      status: "running",
      message: "重新分析中",
      tags: [],
      autoTags: [],
      reviewTags: [],
      filteredTags: [],
      hiddenCount: 0,
      aiReason: "",
      aiBackend: "",
      confidence: 0,
      frameCount: 0,
      diagnosticPath: "",
      diagnostics: null,
      errorType: ""
    });
    state.analysisAbortController = createAnalysisAbortController();
    try {
      const result = await analyzeItem(item, model, allowedTags, settings);
      updateResult(resultId, result);
      setStatus(`已重新分析：${getItemName(item)}`);
    } catch (error) {
      updateResult(resultId, {
        status: "failed",
        message: formatError(error),
        errorType: classifyError(error),
        diagnosticPath: error.diagnosticPath || "",
        diagnostics: error.diagnostics || null,
        tags: [],
        reviewTags: [],
        autoTags: [],
        filteredTags: []
      });
      setStatus(`重新分析失败：${formatError(error)}`);
    } finally {
      state.running = false;
      state.analysisAbortController = null;
      state.pauseRequested = false;
      setControlsBusy(false);
      renderAll();
    }
  }

  function toggleReviewTag(resultId, tagName, selected) {
    const result = state.results.find((item) => item.id === resultId);
    if (!result || !Array.isArray(result.reviewTags)) return;
    const tag = result.reviewTags.find((item) => item.name === tagName);
    if (tag) tag.selected = selected;
    result.tags = getSelectedReviewTags(result).map((item) => item.name);
    saveResultsState();
    renderResults();
  }

  function removeReviewTag(resultId, tagName) {
    const result = state.results.find((item) => item.id === resultId);
    if (!result || !Array.isArray(result.reviewTags)) return;
    result.reviewTags = result.reviewTags.filter((tag) => tag.name !== tagName);
    result.tags = getSelectedReviewTags(result).map((item) => item.name);
    saveResultsState();
    renderResults();
  }

  function addManualTagToResult(resultId, tagName) {
    const result = state.results.find((item) => item.id === resultId);
    if (!result) return;
    const input = Array.from(els.results.querySelectorAll("[data-manual-tag-input]"))
      .find((candidate) => candidate.dataset.manualTagInput === resultId);
    const resolvedTag = cleanTag(tagName || (input && input.value));
    if (!resolvedTag) return;
    const existing = new Set((Array.isArray(result.reviewTags) ? result.reviewTags : []).map((tag) => tag.name));
    if (!existing.has(resolvedTag)) {
      result.reviewTags = [
        ...(Array.isArray(result.reviewTags) ? result.reviewTags : []),
        { name: resolvedTag, confidence: 1, selected: true, source: "manual" }
      ];
    } else {
      result.reviewTags = result.reviewTags.map((tag) => tag.name === resolvedTag ? { ...tag, selected: true } : tag);
    }
    if (!getAllowedTags().includes(resolvedTag)) {
      state.customAllowedTags = normalizeTagList([...state.customAllowedTags, resolvedTag]);
      saveStoredTagState();
    }
    if (["failed", "skipped", "applied"].includes(result.status)) {
      result.status = "ready";
      result.message = "已人工添加标签，可直接写入或重新分析。";
      result.errorType = "";
    }
    result.tags = getSelectedReviewTags(result).map((item) => item.name);
    if (input) input.value = "";
    closeManualTagMenu(resultId);
    saveResultsState();
    renderAll();
  }

  function createPendingResult(item) {
    return {
      id: getItemId(item),
      name: getItemName(item),
      status: "pending",
      message: "等待分析",
      tags: [],
      autoTags: [],
      reviewTags: [],
      aiReason: "",
      aiBackend: "",
      frameCount: 0,
      requestCount: 0,
      mediaChunkCount: 0,
      tagChunkCount: 0,
      diagnosticPath: "",
      confidence: 0,
      errorType: "",
      diagnostics: null,
      filteredTags: []
    };
  }

  function updateResult(id, patch) {
    const index = state.results.findIndex((result) => result.id === id);
    if (index >= 0) {
      state.results[index] = { ...state.results[index], ...patch };
      saveResultsState();
      renderResults();
    }
  }

  function getAllowedTags() {
    const disabled = new Set(state.disabledTags);
    const removed = new Set(state.sessionRemovedTags);
    const custom = state.customAllowedTags.filter((tag) => !disabled.has(tag));
    return normalizeTagList([...state.eagleTags, ...custom]).filter((tag) => !removed.has(tag));
  }

  function getAnalysisAllowedTags(baseAllowedTags = getAllowedTags(), settings = readSettings()) {
    const removed = new Set(state.sessionRemovedTags);
    const fallbackTags = settings && settings.allowOutOfPoolSuggestions ? getDefaultTemplateTags() : [];
    return normalizeTagList([...baseAllowedTags, ...fallbackTags]).filter((tag) => !removed.has(tag));
  }

  function getReviewTagSource(tagName, baseAllowedSet) {
    const tag = cleanTag(tagName);
    if (!tag) return "";
    if (baseAllowedSet && baseAllowedSet.has(tag)) return "";
    return getDefaultTemplateTags().includes(tag) ? "template" : "";
  }

  function getSelectedReviewTags(result) {
    return Array.isArray(result.reviewTags) ? result.reviewTags.filter((tag) => tag.selected) : [];
  }

  function canWriteReadyResults() {
    return !state.writing && (!state.running || state.pauseRequested || state.paused);
  }

  async function mergeTagsIntoItem(item, tags, annotationText, source) {
    const previousTags = Array.isArray(item.tags) ? [...item.tags] : [];
    const existing = previousTags;
    const existingSet = new Set(existing);
    const addedTags = normalizeTagList(tags).filter((tag) => !existingSet.has(tag));
    const previousAnnotation = String(item.annotation || "");
    item.tags = normalizeTagList([...existing, ...tags]);
    appendAnnotation(item, annotationText);
    try {
      await item.save();
    } catch (error) {
      item.tags = previousTags;
      item.annotation = previousAnnotation;
      throw error;
    }
    if (addedTags.length || previousAnnotation !== String(item.annotation || "")) {
      state.undoStack.push({
        itemId: getItemId(item),
        addedTags,
        previousAnnotation,
        source: source || "写入标签",
        at: Date.now()
      });
      saveUndoStack();
      renderResults();
    }
  }

  async function undoLastWrite() {
    const record = state.undoStack[state.undoStack.length - 1];
    if (!record) {
      renderResults();
      return;
    }
    const item = state.selectedItems.find((candidate) => getItemId(candidate) === record.itemId);
    if (!item || typeof item.save !== "function") {
      setStatus("找不到可撤销的 Eagle 素材，请重新导入当前选中素材后再试。");
      renderResults();
      return;
    }
    const removeSet = new Set(record.addedTags || []);
    const currentTags = Array.isArray(item.tags) ? item.tags : [];
    const previousTags = [...currentTags];
    const previousAnnotation = String(item.annotation || "");
    item.tags = currentTags.filter((tag) => !removeSet.has(tag));
    item.annotation = record.previousAnnotation || "";
    try {
      await item.save();
    } catch (error) {
      item.tags = previousTags;
      item.annotation = previousAnnotation;
      setStatus(`撤销失败：${formatError(error)}。撤销记录已保留，可稍后重试。`);
      renderResults();
      return;
    }
    state.undoStack.pop();
    saveUndoStack();
    setStatus(`已撤销：${record.source || "上次写入"}。移除 ${removeSet.size} 个标签。`);
    renderResults();
  }

  function appendAnnotation(item, annotationText) {
    const text = cleanAnnotation(annotationText);
    if (!text) return;
    const marker = "[特效 AI 分析]";
    const existing = String(item.annotation || "").trim();
    const addition = `${marker}\n${text}`;
    if (existing.includes(addition)) return;
    item.annotation = existing ? `${existing}\n\n${addition}` : addition;
  }

  function cleanAnnotation(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }

  async function runWithConcurrency(items, concurrency, worker) {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        if (state.pauseRequested) return;
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    });
    await Promise.all(runners);
  }

  function setControlsBusy(busy) {
    els.analyzeBtn.disabled = busy || state.writing;
    els.pauseBtn.disabled = !busy || state.pauseRequested;
    updateAnalysisControls();
    els.appendSelectedBtn.disabled = busy || state.writing;
    els.replaceSelectedBtn.disabled = busy || state.writing;
    els.clearSelectedBtn.disabled = busy || state.writing || (!state.selectedItems.length && !state.results.length);
    els.miniCollectorBtn.disabled = busy || state.writing;
    updateCollectorBar();
    els.refreshTagsBtn.disabled = busy || state.writing;
    els.importDefaultsBtn.disabled = busy || state.writing;
    els.applyBtn.disabled = !canWriteReadyResults() || state.results.filter((result) => result.status === "ready" && getSelectedReviewTags(result).length).length === 0;
    els.undoBtn.disabled = busy || state.writing || state.undoStack.length === 0;
  }

  function updateAnalysisControls() {
    const hasPending = state.results.some((result) => result.status === "pending");
    const showPausedActions = Boolean(state.paused && hasPending && !state.running);
    els.pauseBtn.hidden = showPausedActions;
    els.continueBtn.hidden = !showPausedActions;
    els.restartBtn.hidden = !showPausedActions;
    els.continueBtn.disabled = !showPausedActions;
    els.restartBtn.disabled = !showPausedActions;
    if (!showPausedActions) {
      els.pauseBtn.hidden = false;
    }
  }

  function getItemId(item) {
    return String(item.id || item._id || item.filePath || item.name);
  }

  function getItemName(item) {
    if (item.name || item.filename || item.title) return item.name || item.filename || item.title;
    if (path && item.filePath) return path.basename(item.filePath);
    return "未命名素材";
  }

  function getItemFilePath(item) {
    const candidates = [item.filePath, item.path, item.file, item.fileURL, item.fileUrl, item.localPath, item.url];
    for (const candidate of candidates) {
      const normalized = normalizeLocalPath(candidate);
      if (normalized) return normalized;
    }
    return "";
  }

  function getItemPreviewPath(item) {
    return item.thumbnailPath || item.previewPath || item.thumbPath || item.thumbnail || "";
  }

  function getItemExt(item, filePath) {
    const ext = item.ext || item.extension || (filePath && path ? path.extname(filePath).slice(1) : "");
    return String(ext || "").toLowerCase();
  }

  function shortPath(filePath) {
    if (!filePath) return "无路径";
    if (!path) return filePath;
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const parent = path.basename(dir);
    return parent ? `${parent}\\${base}` : base;
  }

  function toFileUrl(filePath) {
    return url && url.pathToFileURL ? url.pathToFileURL(filePath).href : `file://${String(filePath).replace(/\\/g, "/")}`;
  }

  function createDiagnosticPreviewUrl(filePath, index) {
    if (index >= DIAGNOSTIC_PREVIEW_LIMIT || !filePath || !fs || !fs.existsSync(filePath)) return "";
    try {
      const bytes = fs.readFileSync(filePath);
      return `data:${getImageMimeType(filePath)};base64,${bytes.toString("base64")}`;
    } catch (error) {
      return toFileUrl(filePath);
    }
  }

  function getImageMimeType(filePath) {
    const ext = path ? path.extname(filePath).toLowerCase() : "";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".svg") return "image/svg+xml";
    if (ext === ".bmp") return "image/bmp";
    return "image/jpeg";
  }

  function fileUrlToPath(fileUrl) {
    const text = String(fileUrl || "");
    if (!text) return "";
    try {
      if (url && url.fileURLToPath && text.startsWith("file:")) return url.fileURLToPath(text);
    } catch (error) {}
    if (!text.startsWith("file://")) return text;
    const withoutScheme = decodeURIComponent(text.replace(/^file:\/\/\/?/, ""));
    return withoutScheme.replace(/\//g, "\\");
  }

  function normalizeLocalPath(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.startsWith("file:")) return fileUrlToPath(text);
    if (/^[a-zA-Z]:[\\/]/.test(text) || text.startsWith("\\\\")) return text;
    return "";
  }

  function extractTagName(tag) {
    if (typeof tag === "string") return tag;
    if (!tag || typeof tag !== "object") return "";
    return tag.name || tag.title || tag.label || tag.tag || "";
  }

  function getTagGroupName(group) {
    if (typeof group === "string") return cleanTag(group);
    if (!group || typeof group !== "object") return "";
    return cleanTag(group.name || group.title || group.label || group.groupName);
  }

  function normalizeTagList(tags) {
    const seen = new Set();
    const output = [];
    tags.forEach((tag) => {
      const cleaned = cleanTag(tag);
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        output.push(cleaned);
      }
    });
    return output;
  }

  function normalizeTagCandidates(tags, fallbackConfidence) {
    const seen = new Set();
    const output = [];
    tags.forEach((tag) => {
      const name = cleanTag(typeof tag === "string" ? tag : tag && (tag.name || tag.tag || tag.label));
      if (!name || seen.has(name)) return;
      seen.add(name);
      const confidence = typeof tag === "object" && tag
        ? normalizeConfidenceValue(tag.confidence ?? tag.score ?? fallbackConfidence, 0.5)
        : normalizeConfidenceValue(fallbackConfidence, 0.5);
      output.push({ name, confidence });
    });
    return output;
  }

  function normalizeTagCandidatesForAllowedTags(tags, fallbackConfidence, allowedTags, options = {}) {
    const allowed = new Set(normalizeTagList(allowedTags || []));
    const byName = new Map();
    const filteredTags = [];
    const includeFilteredTags = options.includeFilteredTags !== false;
    normalizeTagCandidates(tags, fallbackConfidence).forEach((tag) => {
      if (allowed.has(tag.name)) {
        const existing = byName.get(tag.name);
        if (!existing || tag.confidence > existing.confidence) byName.set(tag.name, tag);
        return;
      }
      const splitTags = splitCompositeTag(tag.name).filter((name) => allowed.has(name));
      if (splitTags.length) {
        splitTags.forEach((name) => {
          const existing = byName.get(name);
          if (!existing || tag.confidence > existing.confidence) byName.set(name, { name, confidence: tag.confidence });
        });
      } else {
        if (includeFilteredTags) filteredTags.push(tag.name);
      }
    });
    return {
      candidates: [...byName.values()],
      filteredTags
    };
  }

  function splitCompositeTag(name) {
    return String(name || "")
      .split(/[\/／|、,，;；\s]+/)
      .map(cleanTag)
      .filter(Boolean);
  }

  function normalizeConfidenceValue(value, fallback = 0.5) {
    if (typeof value === "string" && value.trim().endsWith("%")) {
      return clampNumber(Number(value.trim().slice(0, -1)) / 100, 0, 1, fallback);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clampNumber(number > 1 ? number / 100 : number, 0, 1, fallback);
  }

  function cleanTag(tag) {
    return String(tag || "").trim().replace(/\s+/g, " ");
  }

  function safeDomId(value) {
    return String(value || "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "item";
  }

  function readJsonArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? normalizeTagList(value) : [];
    } catch (error) {
      return [];
    }
  }

  function readJsonObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (error) {
      return {};
    }
  }

  function readInt(value, fallback, min, max) {
    const number = parseInt(value, 10);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
  }

  function readFloat(value, fallback, min, max) {
    const number = parseFloat(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    const fallbackValue = fallback === undefined ? min : fallback;
    if (!Number.isFinite(number)) return fallbackValue;
    return Math.max(min, Math.min(max, number));
  }

  function roundTime(value) {
    return Math.round(value * 1000) / 1000;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function withTimeout(promise, ms, message) {
    let timeoutId = 0;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message || "操作超时")), Math.max(1, Number(ms) || 1));
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId) window.clearTimeout(timeoutId);
    });
  }

  function isRetryableAiError(error) {
    const message = formatError(error).toLowerCase();
    if (message.includes("未配置默认视觉模型") || message.includes("没有启用可用")) return false;
    return true;
  }

  function estimateTextSize(text) {
    return String(text || "").length;
  }

  function estimateTextTokens(text) {
    return Math.ceil(estimateTextSize(text) / 2);
  }

  function parseAiJson(text) {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("AI 没有返回内容");
    const cleaned = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return normalizeAiObject(JSON.parse(repairJsonText(cleaned)));
    } catch (firstError) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return normalizeAiObject(JSON.parse(repairJsonText(match[0])));
        } catch (secondError) {
          throw new Error(`AI 返回内容不是有效 JSON：${cleaned.slice(0, 160)}`);
        }
      }
      if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
        try {
          return normalizeAiObject(JSON.parse(repairJsonText(cleaned)));
        } catch (arrayError) {}
      }
      throw new Error(`AI 返回内容不是 JSON：${cleaned.slice(0, 160)}`);
    }
  }

  function repairJsonText(text) {
    return String(text || "")
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'");
  }

  function normalizeAiObject(value) {
    if (Array.isArray(value)) return { tags: value, confidence: 0.5, reason: "" };
    if (!value || typeof value !== "object") {
      throw new Error(`AI 返回内容不是 JSON：${String(value).slice(0, 160)}`);
    }
    if (Array.isArray(value.tags)) return value;
    if (Array.isArray(value.labels)) return { ...value, tags: value.labels };
    if (Array.isArray(value.result)) return { ...value, tags: value.result };
    return value;
  }

  function stateLabel(status) {
    return {
      pending: "等待",
      running: "分析中",
      ready: "待写入",
      failed: "失败",
      skipped: "跳过",
      applied: "已写入"
    }[status] || status;
  }

  function formatConfidence(confidence) {
    return `${Math.round(clampNumber(confidence, 0, 1, 0) * 100)}%`;
  }

  function classifyError(error) {
    const message = formatError(error).toLowerCase();
    if (message.includes("json")) return "json";
    if (message.includes("没有返回") || message.includes("no content")) return "empty-ai";
    if (message.includes("抽帧") || message.includes("frame")) return "frames";
    if (message.includes("ffmpeg") || message.includes("ffprobe")) return "ffmpeg";
    if (message.includes("视觉模型") || message.includes("ai sdk")) return "eagle-ai";
    if (message.includes("路径") || message.includes("文件") || message.includes("预览")) return "file";
    return "unknown";
  }

  function failureTypeLabel(type) {
    return {
      "json": "AI 返回格式错误",
      "empty-ai": "AI 未返回内容",
      "frames": "抽帧失败",
      "ffmpeg": "FFmpeg 不可用",
      "eagle-ai": "Eagle AI 配置问题",
      "file": "素材路径或预览不可用",
      "unknown": "未知错误"
    }[type] || "未知错误";
  }

  function getFileSize(filePath) {
    try {
      return fs && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    } catch (error) {
      return 0;
    }
  }

  function formatBytes(size) {
    if (!Number.isFinite(size) || size <= 0) return "大小未知";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function safeFileName(value) {
    return String(value || "item").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "item";
  }

  function formatError(error) {
    if (!error) return "未知错误";
    if (error.message && error.stack) return `${error.message}`;
    return error.message ? error.message : String(error);
  }

  function setStatus(text) {
    els.statusText.textContent = text;
    if (els.collectorStatus) els.collectorStatus.textContent = text;
  }
})();
