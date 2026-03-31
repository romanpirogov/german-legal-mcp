# German Legal MCP Server

MCP (Model Context Protocol) сервер, агрегирующий **5 публичных источников** немецкого права в единый интерфейс для LLM.

## Источники

| # | Источник | Base URL | Ключ | Контент |
|---|---|---|---|---|
| 1 | **DIP Bundestag** | `search.dip.bundestag.de/api/v1` | ✅ Обязателен | Законопроекты, пленарные протоколы, процедуры, депутаты |
| 2 | **NeuRIS** (Beta) | `testphase.rechtsinformationen.bund.de` | ❌ Нет | Федеральные законы + решения федеральных судов |
| 3 | **Open Legal Data** | `de.openlegaldata.io/api` | ⚙️ Опционально | Судебные решения, законы, реестр судов |
| 4 | **Gesetze im Internet** | `gesetze-im-internet.de` | ❌ Нет | XML всех ~6,800 федеральных законов |
| 5 | **Rechtsprechung i.I.** | `rechtsprechung-im-internet.de` | ❌ Нет | Порталы федеральных судов (RSS/XML) |

## Инструменты (20 штук)

### DIP Bundestag (7 инструментов)
| Инструмент | Описание |
|---|---|
| `dip_search_drucksachen` | Поиск парламентских бумаг (законопроекты, запросы, отчёты) |
| `dip_get_drucksache` | Метаданные одного документа по ID |
| `dip_get_drucksache_text` | Полный текст документа |
| `dip_search_plenarprotokolle` | Поиск стенограмм заседаний |
| `dip_get_plenarprotokoll_text` | Полный текст стенограммы |
| `dip_search_vorgaenge` | Поиск законодательных процедур |
| `dip_get_vorgang` | Детали процедуры по ID |
| `dip_search_persons` | Поиск депутатов и персон |
| `dip_search_aktivitaeten` | Поиск парламентских активностей (речи, голосования) |

### NeuRIS — Rechtsinformationssystem (4 инструмента)
| Инструмент | Описание |
|---|---|
| `neuris_search_legislation` | Поиск федеральных законов и постановлений |
| `neuris_get_legislation` | Полный текст закона по ID |
| `neuris_search_caselaw` | Поиск решений федеральных судов |
| `neuris_get_decision` | Полный текст решения по ID |

### Open Legal Data (5 инструментов)
| Инструмент | Описание |
|---|---|
| `oldp_search_cases` | Поиск судебных решений (все суды Германии) |
| `oldp_get_case` | Полный текст решения по ID |
| `oldp_search_laws` | Поиск законов |
| `oldp_get_law` | Полный текст закона |
| `oldp_list_courts` | Реестр судов с фильтрацией |

### Gesetze im Internet + Rechtsprechung (4 инструмента)
| Инструмент | Описание |
|---|---|
| `gii_list_laws` | Список всех ~6,800 федеральных законов с фильтрацией |
| `gii_get_law_xml` | XML-текст закона по аббревиатуре (BGB, GmbHG, ...) |
| `gii_get_law_url` | Прямые ссылки HTML/PDF/XML для закона |
| `rii_list_court_portals` | Справочник официальных порталов федеральных судов |

## Установка

```bash
git clone <repo>
cd german-legal-mcp-server
npm install
npm run build
```

## Переменные среды

```bash
# Обязателен для DIP Bundestag (бесплатно, регистрация на dip.bundestag.de)
export DIP_API_KEY="ВашКлюч"

# Опционально для Open Legal Data (без ключа работает с ограничениями)
export OLDP_API_KEY="ВашКлюч"

# Транспорт: stdio (по умолчанию) или http
export TRANSPORT=stdio   # или http
export PORT=3000         # только для http
```

## Запуск

### stdio (для Claude Desktop, cursor и др.)
```bash
npm start
# или
node dist/index.js
```

### HTTP (для удалённого доступа)
```bash
TRANSPORT=http npm start
# MCP endpoint: http://localhost:3000/mcp
# Health check: http://localhost:3000/health
```

## Конфигурация Claude Desktop

```json
{
  "mcpServers": {
    "german-legal": {
      "command": "node",
      "args": ["/path/to/german-legal-mcp-server/dist/index.js"],
      "env": {
        "DIP_API_KEY": "ВашКлюч",
        "OLDP_API_KEY": "ВашКлюч"
      }
    }
  }
}
```

## Получение API ключей

- **DIP Bundestag**: [dip.bundestag.de/über-dip/hilfe/api](https://dip.bundestag.de/über-dip/hilfe/api) — бесплатно, без ограничений
- **Open Legal Data**: [de.openlegaldata.io](https://de.openlegaldata.io) — регистрация, бесплатно

## Лицензия

MIT. Данные из всех источников являются общественным достоянием (public domain) или открытыми данными немецкого правительства.
