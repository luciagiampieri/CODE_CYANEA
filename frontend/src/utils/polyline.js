// Decodifica el formato de polilínea codificada de Google 
export function decodePolyline(encoded) {
    if (!encoded) return [];

    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates = [];
    const factor = 1e5;

    while (index < encoded.length) {
        let shift = 0;
        let result = 0;
        let byte;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

        shift = 0;
        result = 0;

        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

        coordinates.push({ lat: lat / factor, lng: lng / factor });
    }

    return coordinates;
}