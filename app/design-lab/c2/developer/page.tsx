import { pickLang } from "../../_c/content";
import { C2Developer } from "../../_c2/c2";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <C2Developer lang={pickLang((await searchParams).lang)} />; }
