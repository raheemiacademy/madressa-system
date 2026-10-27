import { Chapters } from './Chapters';
import { Closing } from './Closing';
import { Compare } from './Compare';
import { EarlyAccess } from './EarlyAccess';
import { Faq } from './Faq';
import { Hero } from './Hero';
import { Phones } from './Phones';
import { Shell } from './Shell';
import { SwitchAndData } from './SwitchAndData';

/** The public homepage (design-reference/website/index.html). */
export function Home() {
  return (
    <Shell>
      <Hero />
      <Compare />
      <Chapters />
      <Phones />
      <SwitchAndData />
      <EarlyAccess />
      <Faq />
      <Closing />
    </Shell>
  );
}
