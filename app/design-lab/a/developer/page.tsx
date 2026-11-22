import { pickLang } from "../../_c/content";
import { ADeveloper } from "../../_c/a";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <ADeveloper lang={pickLang((await searchParams).lang)} />; }
