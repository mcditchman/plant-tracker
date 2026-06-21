import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function buildSystemPrompt(geoCoords?: { lat: number; lng: number } | null) {
  const locationContext = geoCoords
    ? `\n\nThe user is located at approximately ${geoCoords.lat.toFixed(2)}°, ${geoCoords.lng.toFixed(2)}°. Use this to tailor care advice to their local climate, seasons, humidity, and typical growing conditions. This is in the ${geoCoords.lat >= 0 ? 'Northern' : 'Southern'} hemisphere — return all "seasonal" months below adjusted for this hemisphere (e.g. a spring bloomer in the Southern hemisphere blooms Sep-Nov, not Mar-May).`
    : '\n\nNo location was provided — assume the Northern hemisphere for the "seasonal" months below.';

  return `You are a plant identification and care expert. When given an image or plant name, return a JSON object with plant identification and care information. Always respond with valid JSON only, no markdown.${locationContext}

Response format:
{
  "identified": true,
  "common_name": "string",
  "scientific_name": "string",
  "confidence": "high" | "medium" | "low",
  "description": "2-3 sentence description of the plant",
  "difficulty": "easy" | "moderate" | "hard",
  "care": {
    "light": "string describing light needs",
    "water": "string describing watering needs",
    "watering_frequency_days": number (how many days between waterings),
    "humidity": "string",
    "temperature": "string with fahrenheit range",
    "soil": "string",
    "fertilizer": "string",
    "fertilize_frequency_days": number
  },
  "tips": ["tip1", "tip2", "tip3", "tip4", "tip5"],
  "seasonal": {
    "bloom_months": [numbers 1-12, empty array if non-flowering or no notable bloom],
    "growth_months": [numbers 1-12, months of active growth],
    "dormancy_months": [numbers 1-12, months of dormancy/reduced growth, empty array if it grows steadily year-round],
    "pruning_months": [numbers 1-12, best months to prune or repot]
  }
}

If you cannot identify the plant, set "identified": false and use "Unknown Plant" for common_name. Always return valid JSON.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, imageType, searchText, geoCoords } = body;

    if (!imageBase64 && !searchText) {
      return NextResponse.json({ error: 'Provide either an image or search text' }, { status: 400 });
    }

    let messages: Anthropic.MessageParam[];

    if (imageBase64) {
      messages = [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageType || 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'Identify this plant and provide complete care information. Return JSON only.',
          },
        ],
      }];
    } else {
      messages = [{
        role: 'user',
        content: `Identify the plant "${searchText}" and provide complete care information. Return JSON only.`,
      }];
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(geoCoords),
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON - handle potential markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const plantInfo = JSON.parse(jsonMatch[0]);
    return NextResponse.json(plantInfo);
  } catch (error) {
    console.error('Identify error:', error);
    return NextResponse.json({ error: 'Failed to identify plant' }, { status: 500 });
  }
}
