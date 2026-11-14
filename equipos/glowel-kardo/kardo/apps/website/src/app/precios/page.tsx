import { PricingPage, pricingMetadata } from "@/components/pricing/PricingPage";
import "../landing-editorial.css";

export const metadata = pricingMetadata();

export default function Page() {
  return <PricingPage />;
}
