import { pickLang } from "../../_c/content";
import { AResults } from "../../_c/a";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <AResults lang={pickLang((await searchParams).lang)} />; }
