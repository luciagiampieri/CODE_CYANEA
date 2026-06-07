import { BrowserRouter, Route, Routes } from "react-router-dom";

import HomePage from "../pages/home/HomePage";
import CreateTripPage from "../pages/trips/CreateTripPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/viajes/nuevo" element={<CreateTripPage />} />
      </Routes>
    </BrowserRouter>
  );
}
