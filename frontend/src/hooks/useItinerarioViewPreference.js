import { useCallback, useState } from "react";


let vistaItinerarioActual = "timeline";

export default function useItinerarioViewPreference() {
    const [vista, setVistaState] = useState(vistaItinerarioActual);

    const setVista = useCallback((nuevaVista) => {
        vistaItinerarioActual = nuevaVista;
        setVistaState(nuevaVista);
    }, []);

    return [vista, setVista];
}