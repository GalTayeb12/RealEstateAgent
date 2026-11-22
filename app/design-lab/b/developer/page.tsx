import { pickLang } from "../../_c/content";
import { BDeveloper } from "../../_c/b";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <BDeveloper lang={pickLang((await searchParams).lang)} />; }
