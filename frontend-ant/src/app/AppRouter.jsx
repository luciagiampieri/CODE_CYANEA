import { BrowserRouter, Route, Routes } from "react-router-dom";

import HomePage from "../pages/home/HomePage";
import CreateTripPage from "../pages/trips/CreateTripPage";
import RegisterPage from "../pages/auth/RegisterPage";

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/viajes/nuevo" element={<CreateTripPage />} />
        <Route path="/registro" element={<RegisterPage />} />
      </Routes>
    </BrowserRouter>
  );
}
