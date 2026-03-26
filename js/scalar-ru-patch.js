/* scalar-ru-patch.js
 * Патч русификации UI для Scalar API Reference (локальная дока)
 * Работает через TreeWalker + MutationObserver + Shadow DOM hook
 */
(function (global) {
    "use strict";

    const ScalarRuPatch = {
        version: "1.0.0",

        // Настройки
        config: {
            enabled: true,
            debug: false,
            // если true — будет пытаться перехватить attachShadow (самое стойкое решение)
            hookShadowDom: true,
            // чисто визуальщина лучше решить дереференсом
            normalizeArrayPropertyDetails: false,

            excludeSelectors: [
                ".schema-type",
                ".schema-name",
                ".schema-title",
                "code",
                "pre",
                "[data-component='Schema']",
                "li button > div",
            ],
        },

        // Словарь. Ключи — как встречаются в UI (в точности/частично).
        dict: new Map([
            ["Introduction", "Magnit Market API"],
            ["Search", "Поиск"],
            ["Server", "Сервер"],
            ["Authentication", "Авторизация"],
            ["Required", "Обязательно"],
            ["required", "обязательно"],
            ["Responses", "Ответы сервера"],
            ["Response", "Ответ сервера"],
            ["Body", "Тело запроса"],
            ["Request Body", "Тело запроса"],
            ["Path Parameters", "Параметр пути"],
            ["Header", "Заголовок"],
            ["Query", "Параметр запроса"],
            ["Show More", "Показать"],
            ["Show less", "Скрыть"],
            ["Name", "Имя"],
            ["Value", "Значение"],
            ["Client Libraries", "Клиентские библиотеки"],
            ["More", "Ещё"],
            ["Download OpenAPI Document", "Скачать OpenAPI документ"],
            ["Operations", "Операции"],
            ["Models", "Модели"],
            ["Show Child Attributes", "Показать дочерние атрибуты"],
            ["Hide Child Attributes", "Скрыть дочерние атрибуты"],
            ["Example", "Пример"],
            ["Try it", "Выполнить"],
            ["Send", "Отправить"],
            ["Show Schema", "Показать схему"],
            ["Test Request", "Протестировать запрос"],
        ]),

        log(...args) {
            if (this.config.debug) console.log("[ScalarRuPatch]", ...args);
        },

        replaceInText(text) {
            if (!text) return text;

            const trimmed = text.trim();

            if (this.dict.has(trimmed)) {
                return text.replace(trimmed, this.dict.get(trimmed));
            }

            return text;
        },

        translateTextNode(node) {
            const text = node.nodeValue;
            if (!text) return;

            const trimmed = text.trim();
            if (!trimmed) return;

            // 1) Если это внутри "технических" контейнеров — пропускаем
            const p = node.parentElement;
            if (p && this.config.excludeSelectors?.length) {
                for (const sel of this.config.excludeSelectors) {
                    if (p.closest(sel)) return;
                }
            }

            // 2) Только точное совпадение
            const ru = this.dict.get(trimmed);
            if (!ru) return;

            node.nodeValue = ru;
        },

        normalizeArrayTypeText(text) {
            if (!this.config.normalizeArrayPropertyDetails) return text;
            if (!text) return text;

            return text.replace(/\barray\s+\S*\[\]/g, "array");
        },

        normalizeTextNode(node) {
            if (!this.config.normalizeArrayPropertyDetails) return;

            const text = node.nodeValue;
            if (!text) return;

            const parent = node.parentElement;
            if (!parent) return;
            if (!parent.closest(".property-detail-value")) return;

            const normalized = this.normalizeArrayTypeText(text);
            if (normalized !== text) {
                node.nodeValue = normalized;
            }
        },

        translateTree(root) {
            try {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let n;
                while ((n = walker.nextNode())) {
                    // пропускаем пустые/шумные
                    if (!n.nodeValue || !n.nodeValue.trim()) continue;
                    this.translateTextNode(n);
                    this.normalizeTextNode(n);
                }
            } catch (e) {
                // root может быть не Document/Element (редко), игнорируем
            }
        },

        observe(root) {
            const obs = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const added of m.addedNodes) {
                        if (added.nodeType === Node.TEXT_NODE) {
                            this.translateTextNode(added);
                            this.normalizeTextNode(added);
                            continue;
                        }
                        if (added.nodeType === Node.ELEMENT_NODE) {
                            this.translateTree(added);

                            // если появился новый shadowRoot — обработаем
                            if (added.shadowRoot) {
                                this.translateTree(added.shadowRoot);
                                this.observe(added.shadowRoot);
                            }
                        }
                    }
                }
            });

            obs.observe(root, { childList: true, subtree: true });
            return obs;
        },

        patchExistingShadowRoots() {
            document.querySelectorAll("*").forEach((el) => {
                if (el.shadowRoot) {
                    this.translateTree(el.shadowRoot);
                    this.observe(el.shadowRoot);
                }
            });
        },

        hookAttachShadow() {
            if (!this.config.hookShadowDom) return;
            const proto = Element.prototype;
            if (proto.__scalarRuPatchShadowHooked) return;

            const original = proto.attachShadow;
            if (typeof original !== "function") return;

            proto.attachShadow = function (...args) {
                const shadow = original.apply(this, args);
                // defer — чтобы внутрь успели что-то отрендерить
                queueMicrotask(() => {
                    try {
                        ScalarRuPatch.translateTree(shadow);
                        ScalarRuPatch.observe(shadow);
                    } catch (_) {}
                });
                return shadow;
            };

            proto.__scalarRuPatchShadowHooked = true;
            this.log("attachShadow hooked");
        },

        init(userConfig = {}) {
            this.config = { ...this.config, ...userConfig };
            if (!this.config.enabled) return;

            this.hookAttachShadow();

            // initial
            this.translateTree(document.body);
            this.observe(document.body);
            this.patchExistingShadowRoots();

            this.log("initialized", { version: this.version, config: this.config });
        },
    };

    // экспорт в window
    global.ScalarRuPatch = ScalarRuPatch;
})(window);
