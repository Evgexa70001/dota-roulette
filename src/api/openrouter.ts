/**
 * OpenRouter API клиент для получения рекомендаций предметов от ИИ
 * 
 * Документация: https://openrouter.ai/docs
 * API Endpoint: https://openrouter.ai/api/v1/chat/completions
 */

export interface AIRecommendation {
  boots?: number[];
  starting?: number[];
  early?: number[];
  mid?: number[];
  late?: number[];
  finalBuild?: number[]; // Финальный билд из 6 предметов
}

export interface AIRecommendationResponse {
  recommendations: AIRecommendation;
  reasoning?: string;
}

/**
 * Получение рекомендаций предметов от ИИ на основе пика героев
 * 
 * @param myHero - Герой, на котором играем
 * @param myTeam - Команда героев (5 героев)
 * @param enemyTeam - Команда соперника (5 героев)
 * @param availableItems - Доступные предметы из Stratz с их статистикой
 * @returns Рекомендации предметов по этапам игры или null при ошибке
 */
export const getAIRecommendations = async (
  myHero: { id: string; displayName: string },
  myTeam: Array<{ id: string; displayName: string }>,
  enemyTeam: Array<{ id: string; displayName: string }>,
  availableItems: {
    boots: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>;
    starting: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>;
    early: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>;
    mid: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>;
    late: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>;
  }
): Promise<AIRecommendationResponse | null> => {
  try {
    const apiKey = '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';

    // Формируем список доступных предметов для промпта
    const formatItems = (items: Array<{ itemId: number; displayName: string; winsAverage: number; matchCount: number }>) => {
      return items.map(item => 
        `- ${item.displayName} (ID: ${item.itemId}, Win Rate: ${(item.winsAverage * 100).toFixed(1)}%, Matches: ${item.matchCount})`
      ).join('\n');
    };

    const prompt = `Ты эксперт по Dota 2. Проанализируй пик героев и подбери оптимальные предметы для героя "${myHero.displayName}" из доступного списка предметов.

ПИК ГЕРОЕВ:
Наша команда: ${myTeam.map(h => h.displayName).join(', ')}
Команда соперника: ${enemyTeam.map(h => h.displayName).join(', ')}

ГЕРОЙ, НА КОТОРОМ ИГРАЕМ: ${myHero.displayName}

ДОСТУПНЫЕ ПРЕДМЕТЫ ПО ЭТАПАМ ИГРЫ:

Ботинки:
${formatItems(availableItems.boots)}

Начальная игра (-1:40):
${formatItems(availableItems.starting)}

Ранняя игра (0:00 - 15:00):
${formatItems(availableItems.early)}

Мидгейм (15:00 - 35:00):
${formatItems(availableItems.mid)}

Поздняя игра (35:00+):
${formatItems(availableItems.late)}

ЗАДАЧА:
Подбери оптимальные предметы для героя "${myHero.displayName}" с учетом:
1. Состава нашей команды и команды соперника
2. Синергии с союзниками
3. Контрпиков против врагов
4. Статистики винрейта предметов из доступного списка

ВАЖНО: 
- Выбирай предметы ТОЛЬКО из предоставленного списка
- Указывай только ID предметов (числа)
- Для каждого этапа игры выбери наиболее подходящие предметы (обычно 1-4 предмета на этап)
- Финальный билд должен содержать РОВНО 6 предметов - это оптимальный набор предметов для поздней игры

Верни ответ в формате JSON:
{
  "boots": [itemId1, itemId2],
  "starting": [itemId1, itemId2, itemId3],
  "early": [itemId1, itemId2],
  "mid": [itemId1, itemId2, itemId3],
  "late": [itemId1, itemId2],
  "finalBuild": [itemId1, itemId2, itemId3, itemId4, itemId5, itemId6],
  "reasoning": "Краткое объяснение выбора предметов с учетом пика"
}

Только JSON, без дополнительного текста.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Dota 2 Hero Roulette',
      },
      body: JSON.stringify({
        model: 'tngtech/deepseek-r1t2-chimera:free',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`OpenRouter API error: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const result = await response.json();
    
    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      console.error('Invalid response format from OpenRouter API', result);
      return null;
    }

    const content = result.choices[0].message.content.trim();
    
    // Пытаемся извлечь JSON из ответа (может быть обернут в markdown код блоки)
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
    } else {
      // Пытаемся найти JSON объект напрямую
      const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonContent = jsonObjectMatch[0];
      }
    }

    try {
      const parsed = JSON.parse(jsonContent);
      
      // Валидация структуры ответа
      const recommendations: AIRecommendation = {
        boots: Array.isArray(parsed.boots) ? parsed.boots : undefined,
        starting: Array.isArray(parsed.starting) ? parsed.starting : undefined,
        early: Array.isArray(parsed.early) ? parsed.early : undefined,
        mid: Array.isArray(parsed.mid) ? parsed.mid : undefined,
        late: Array.isArray(parsed.late) ? parsed.late : undefined,
        finalBuild: Array.isArray(parsed.finalBuild) ? parsed.finalBuild : undefined,
      };

      return {
        recommendations,
        reasoning: parsed.reasoning || undefined,
      };
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, 'Content:', content);
      return null;
    }
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return null;
  }
};

