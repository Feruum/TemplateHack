# Веб-приложение

`webapp` — CSR-клиент для работы после входа, с отдельными разделами по ролям. SEO ему не нужен; публичные страницы находятся в `website`. Клиент делит API-контракты с mobile и централизует серверные данные, формы, вход и навигацию.

До работы с передачей данных, корзиной, checkout, заказами, подписками, доступом и платежами прочитай [docs/WEB_SURFACES.md](../docs/WEB_SURFACES.md).

## RAG chat interface libraries

Active workspace controls use **Arc Free** through `src/components/interface/`, with copied MIT source in `src/components/arc/`. Forms, cards, buttons, alerts, Select, search, table, avatar/menu, badges, skeletons, and empty states use Arc. Chats retain assistant-ui. Sidebar/Sheet support, Field, Item, Separator, Spinner, and destructive AlertDialog remain shadcn/ui fallbacks. See [ARC_MIGRATION.md](../docs/ARC_MIGRATION.md).

The Arc migration passed final types, lint, **97 webapp tests**, and the production build. Workspace browser coverage includes 18 distinct scenarios across the full run and targeted reruns; the expanded mobile focus/pointer/Escape regression passed three repetitions at each of 390px and 700px. See [dated verification](../docs/VERIFICATION.md).

Account avatars use **Blobatar 2.7.0** generated locally from the stable account ID, with uploaded photos taking precedence. The account menu and profile share the same face. The assistant-ui waiting state includes its decorative `thinking` expression. See [BLOBATAR.md](../docs/BLOBATAR.md) for ownership and focused checks.

The signed-in `/app/assistant` route uses **@assistant-ui/react 0.15.29** LocalRuntime for chat messages, composer state, scrolling, and cancellation. **Arc Free EmptyState and Badge** provide empty states and status badges; **Motion 14.3.0** is pinned for their animations. TanStack Query owns session-scoped document/module/memory data. The existing authenticated Bun/Python backend owns RAG and provider credentials.

Earlier RAG integration checks on 2026-10-16 passed: **91 webapp tests and 4 Chromium scenarios**, including mobile, sources/tools, uploads, explicit note save/reload/delete, cancellation, and HTTP errors. Types and production builds passed. Private caches and pending reads clear on sign-out; changing accounts resets local chat and drafts.

Read [design.md](../design.md) for library responsibilities and visual conventions, and [CHAT_UI.md](../docs/CHAT_UI.md) for integration behavior and tests. Retain the [Arc Free license/provenance](src/components/arc/README.md). These additions do not configure a model provider or assistant-ui Cloud.

## Состояние приложения

Этот раздел обновляется при установке. Если статус в [CHECKLIST.md](../CHECKLIST.md) — `in progress` или `completed`, а `webapp` не выбран, добавь сюда причину отсрочки браузерной части. При подключении приложения отметь его в опросе и обнови заметку до разработки.

## Стек

React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI, TanStack Query/Form/Router, Zod из `@web-app-demo/contracts`, shadcn CLI, Playwright и ESLint.

## Команды

```bash
bun run dev
bun run build
bun run typecheck
bun run lint
bun run test
bun run e2e
bun run e2e:ui
bun run ui:info
bun run storybook
bun run storybook:build
```

Из корня: `bun run dev:webapp`, `bun run build:webapp`, `bun run typecheck:webapp`, `bun run test:webapp`, `bun run e2e:webapp`, `bun run storybook:webapp`, `bun run storybook:build:webapp`.

Storybook работает локально на порту `6006`. Он показывает все модули `src/components/ui`, независимые от маршрутов компоненты типографики и панелей, а также учебные формы, метрики, таблицы и состояния данных.

Stories используют реальные глобальные CSS, темы, шрифты, подсказки и порталы. Маршруты, auth/API-состояние и компоненты функций туда не входят. Статический каталог нужен только для локальных проверок; production-сборка Vite его не содержит.

## Переменные окружения

При необходимости создай `webapp/.env`:

```bash
VITE_API_URL=http://localhost:3000
```

`VITE_API_URL` встраивается при сборке. В production укажи точный origin backend, например `https://api.example.com`. После изменения пересобери и опубликуй App Platform Static Site, иначе клиент сохранит старый адрес.

## Деплой

Хостинг задаёт выбранный Terraform-стек. DigitalOcean создаёт Static Site из неизменяемой ветки `infra-release/<commit>` и использует `index.html` для маршрутов SPA.

Yandex собирает `webapp/dist` из `git archive` того же коммита. Сначала публикует неизменяемые ресурсы, затем HTML в бакет Object Storage. Cloud CDN подключается отдельно.

Используй `bun run release -- <digitalocean|yandex>` по [инструкции деплоя](../docs/DEPLOYMENT.md).

## Правила работы

Используй TanStack Query для серверных данных, TanStack Mutation для записи, TanStack Form для форм и Zod из `packages/contracts` для валидации.

Access-токен живёт только в памяти браузера. Refresh использует HttpOnly-cookie backend. Общий Web Lock последовательно выполняет изменения auth-cookie во вкладках одного origin.

События с версией сессии сбрасывают старые токены и кэш при входе, регистрации, истечении сессии и выходе. Это происходит до применения другого пользователя. Refresh/retry сравнивает JWT subject и не повторяет авторизованную операцию от имени другого пользователя.

`src/features/auth` служит примером контекста. Его публичный index экспортирует провайдер, пользователя, интерфейс входа и авторизованный транспорт для новых API. Адаптер управляет auth-путями и refresh/retry. Формы входа, регистрации и сброса используют общие контракты. Страницы не содержат бизнес-логику.

Помещай пользовательские Query-ключи под `['session', ...]`. Вход, регистрация, подтверждённый выход и истечение сессии отменяют запросы и удаляют старый кэш сессии. Публичный кэш сохраняется.

Успешная смена аккаунта заставляет соседние вкладки восстановить сессию из актуальной HttpOnly-cookie. Подтверждённый выход и истечение сессии очищают их интерфейс. Если logout на сервере не прошёл, cookie и локальное состояние сохраняются. Покажи ошибку с возможностью повтора, не изображай успешный выход.

При добавлении торговли этот проект содержит единственный браузерный checkout. Он принимает недоверенный выбор с сайта, сохраняет его при регистрации/входе и возвращает пользователя на безопасный для роли `/app/checkout`. До оплаты backend заново определяет цены и наличие.

Можно использовать переходы провайдера и окна кошельков. Заказы, платежи и webhooks остаются в backend. Добавляй в кабинет только нужные продукту checkout, статусы покупок/подписок, историю и настройки. В основной ветке пока нет корзины, checkout-маршрута и браузерного платёжного модуля. До реализации обнови реестр возможностей.

Маршруты разделены по ролям:

- `/` проверяет сессию и направляет гостя на `/login`.
- `/login` и `/signup` используют официальную двухколоночную композицию Vega `login-02`/`signup-02`.
- `/forgot-password` запрашивает общую инструкцию сброса. `/reset-password` читает одноразовый токен из фрагмента URL и удаляет его из истории.
- `user`: `/app`, `/app/profile`, `/app/settings`.
- `admin`: `/admin`, `/admin/users`, `/admin/settings`.

Оболочка появляется после проверки сессии. После входа гость возвращается только на известный безопасный внутренний путь. Пользователь, открывший раздел другой роли, переходит на свою главную страницу.

`WorkspaceShell` управляет `SidebarProvider`, сворачиваемым боковым меню, мобильной панелью, inset/trigger, меню роли, блоком аккаунта и выходом. Страницы составляют только своё содержимое.

- `src/features/users`: API и изменения профиля, пользовательские страницы. Изменение профиля обновляет только запрос текущего пользователя.
- `src/features/admin`: API панели, списка и ролей, страницы администратора. Смена роли сбрасывает только запросы панели и каталога. Клиент затронутого пользователя замечает отзыв сессии при следующем запросе или восстановлении.
- `src/features/navigation`: чистое соответствие роли и маршрутов.

Общие fetch, базовый URL и разбор ошибок находятся в `src/platform/api` без знания конкретных endpoint. Каждый `src/features/<context>` владеет путями, схемами, запросами и провайдером. Страницы импортируют только публичные `index.ts`. Функции используют platform и UI; platform и `src/components/ui` не импортируют продуктовые функции. После изменения границ выполни `bun run architecture:check`.

`src/components/ui` is the retained generated shadcn registry. Active screens import Arc through `@/components/interface/*`; import from `@/components/ui/*` only for documented missing Free equivalents or assistant-ui chat support. Keep copied Arc source in `src/components/arc`, Typography in its shared owner, and product compositions in their features. Optional Storybook examples retain the full shadcn catalog.

Продуктовый компонент владеет поверхностью, отступами, скруглением, типографикой, адаптацией и размерами элементов. Его props описывают данные, состояния и callbacks. Не открывай обход через `className` или `style`.

Страница размещает закрытые компоненты через внешние обёртки. Ограниченные стилевые props допустимы только у низкоуровневых UI- и layout-примитивов. Сужай DOM-props локальным `Pick`/`Omit`, как в `DashboardLink`. Описывай продуктовые props явно. Используй Tailwind и токены `src/index.css`, не одноразовые глобальные CSS-классы.

Весь продуктовый текст выводи через `Typography` из `src/components/typography.tsx`: обычный текст, `h1`–`h6`, подписи, выделения, сочетания клавиш, code/kbd и текст для скринридеров. ESLint проверяет код приложения, кроме генерируемого `src/components/ui`.

В `components.json` закреплены `radix-vega`, `hugeicons` и CSS-переменные. Реестр ранее обновлён командой `npx shadcn@latest add --all -c webapp --overwrite -y`; формы основаны на `login-02` и `signup-02`. Поля используют стандартный Vega `rounded-md`. Оболочка работает с реальными API-данными, не демонстрационными. Не добавляй сторонние реестры или генераторы без запроса продукта.

Для добавления или обновления компонентов:

```bash
bun run --cwd webapp ui:info
bun run --cwd webapp ui:add -- <component>
```

The `ui`, `ui:add`, and `ui:info` commands run the pinned `shadcn@4.16.1` generator through `bunx` on demand. They require registry access on the first run. Do not use `shadcn@latest` for routine regeneration: new output can differ from this template. Keep compatibility edits in generated components small, and keep product compositions outside the registry.

Both frontends import the unchanged shared CSS in `../styles/vendor/shadcn/tailwind.css`, with its MIT license and [provenance note](../styles/vendor/shadcn/README.md). The generator is outside the application dependency tree because its `braces` dependency has an unpatched advisory. Run the optional tool only with trusted component and registry inputs. Preserve the shared CSS import when regenerating components; do not reinstall the generator as an application dependency.

## E2E

Playwright проверяет важные успешные сценарии через настоящий интерфейс и backend по [правилам тестирования](../AGENTS.md#testing-and-verification). Запускай браузер только по явному запросу.

Скрипт запускает `postgres_test`, применяет миграции к `web_app_demo_test`, создаёт E2E-администратора и запускает backend с `DATABASE_URL` из `TEST_DATABASE_URL`. Затем запускает Vite. После прогона он по умолчанию удаляет том тестовой БД.

Первый запуск:

```bash
docker compose version
docker info
bun run e2e:install
bun run e2e -- auth.spec.ts -g "registers, restores"
```

Для задачи выбирай `spec -g "test name"`. Полный `bun run e2e` нужен для явного релиза, аудита или сквозного браузерного изменения.

Подробности — в [docs/TESTING.md](../docs/TESTING.md).

## Официальная документация

Правила проекта описаны выше. Поведение библиотек проверяй по актуальной документации:

- [React](https://react.dev/reference/react)
- [Vite](https://vite.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Radix UI](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form](https://tanstack.com/form/latest/docs/framework/react/quick-start)
- [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- [Zod](https://zod.dev/)
- [Playwright](https://playwright.dev/docs/intro)
- [ESLint](https://eslint.org/docs/latest/)
