import { NextRequest, NextResponse } from "next/server";

type WeatherResponse = {
  basis: "course" | "city" | "none";
  label: string | null;
  tempC: number | null;
  summary: string | null;
  highC: number | null;
  lowC: number | null;
  precipChance: number | null;
};

// Simple weathercode to summary mapping
function getWeatherSummary(code: number): string {
  // WMO Weather interpretation codes (WW)
  if (code === 0) return "Clear";
  if (code >= 1 && code <= 3) return "Mostly clear";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Cloudy";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const cityParam = searchParams.get("city");

  let lat: number | null = null;
  let lng: number | null = null;
  let city: string | null = null;

  // Parse lat/lng if provided
  if (latParam && lngParam) {
    const parsedLat = Number.parseFloat(latParam);
    const parsedLng = Number.parseFloat(lngParam);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      lat = parsedLat;
      lng = parsedLng;
    }
  }

  // Get city if provided
  if (cityParam) {
    city = cityParam.trim() || null;
  }

  // Validate: need either valid lat/lng OR city
  if ((!lat || !lng) && !city) {
    return NextResponse.json(
      { error: "Either lat/lng or city must be provided" },
      { status: 400 }
    );
  }

  let finalLat: number | null = null;
  let finalLng: number | null = null;
  let basis: "course" | "city" | "none" = "none";
  let label: string | null = null;

  // Priority 1: Use lat/lng if valid
  if (lat && lng) {
    finalLat = lat;
    finalLng = lng;
    basis = "course";
  } else if (city) {
    // Priority 2: Geocode city
    try {
      const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geocodeRes = await fetch(geocodeUrl);
      
      if (!geocodeRes.ok) {
        throw new Error("Geocoding failed");
      }

      const geocodeData = await geocodeRes.json();
      
      if (geocodeData.results && geocodeData.results.length > 0) {
        const result = geocodeData.results[0];
        finalLat = result.latitude;
        finalLng = result.longitude;
        label = result.name || city;
        basis = "city";
      } else {
        // No geocoding results - return unavailable
        return NextResponse.json<WeatherResponse>({
          basis: "none",
          label: null,
          tempC: null,
          summary: null,
          highC: null,
          lowC: null,
          precipChance: null,
        });
      }
    } catch (error) {
      // Geocoding failed - return unavailable
      return NextResponse.json<WeatherResponse>({
        basis: "none",
        label: null,
        tempC: null,
        summary: null,
        highC: null,
        lowC: null,
        precipChance: null,
      });
    }
  }

  // Fetch weather forecast
  if (!finalLat || !finalLng) {
    return NextResponse.json<WeatherResponse>({
      basis: "none",
      label: null,
      tempC: null,
      summary: null,
      highC: null,
      lowC: null,
      precipChance: null,
    });
  }

  try {
    // Open-Meteo forecast API (no key required)
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${finalLat}&longitude=${finalLng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
    const forecastRes = await fetch(forecastUrl);

    if (!forecastRes.ok) {
      throw new Error("Forecast failed");
    }

    const forecastData = await forecastRes.json();

    if (!forecastData.current || !forecastData.daily) {
      throw new Error("Invalid forecast data");
    }

    const current = forecastData.current;
    const daily = forecastData.daily;

    return NextResponse.json<WeatherResponse>({
      basis,
      label,
      tempC: Math.round(current.temperature_2m) || null,
      summary: getWeatherSummary(current.weather_code || 0),
      highC: daily.temperature_2m_max?.[0] ? Math.round(daily.temperature_2m_max[0]) : null,
      lowC: daily.temperature_2m_min?.[0] ? Math.round(daily.temperature_2m_min[0]) : null,
      precipChance: daily.precipitation_probability_max?.[0] || null,
    });
  } catch (error) {
    // Provider failure - return unavailable
    return NextResponse.json<WeatherResponse>({
      basis: "none",
      label: null,
      tempC: null,
      summary: null,
      highC: null,
      lowC: null,
      precipChance: null,
    });
  }
}
