/**
 * 扫描 provider 注册表（12 轮修复）：由 schemaCatalog 程序化派生，杜绝
 * "schema 声明了 reminders 但忘了注册 provider"的手工清单漂移——
 * 此前 parenting/schooling 两模块的提醒因清单未更新而从未生效。
 */
import type { ModuleSchema } from "@/core/schema";
import type { DataProvider, ProviderDeps } from "./providers";
import { CertsProvider, MembersProvider, SchemaLedgerProvider, NumericRuleProvider, VehiclesProvider } from "./providers";

/** certs/members 有专属 provider（双规则/生日语义），其余模块走 schema 通用派生 */
const SPECIAL_PROVIDERS = new Set(["certs", "members", "vehicles"]);

/**
 * 遍历 schemaCatalog 生成全部 provider：
 * - 声明了 reminders/numericRules 的 schema → SchemaLedgerProvider；
 * - 声明 numericRules 的追加 NumericRuleProvider（H15）；
 * - 无规则的模块不注册（不发起无谓读取，PF04 语义）。
 */
export function buildScanProviders(schemaCatalog: Record<string, ModuleSchema>, deps: ProviderDeps): DataProvider[] {
    const providers: DataProvider[] = [
        new CertsProvider(deps),
        new MembersProvider(deps),
    ];
    const vehiclesSchema = schemaCatalog.vehicles;
    if (vehiclesSchema && ((vehiclesSchema.reminders?.length ?? 0) > 0 || (vehiclesSchema.numericRules?.length ?? 0) > 0)) {
        providers.push(new VehiclesProvider(vehiclesSchema, deps));
    }
    for (const [moduleId, schema] of Object.entries(schemaCatalog)) {
        if (SPECIAL_PROVIDERS.has(moduleId)) continue;
        const hasRules = (schema?.reminders?.length ?? 0) > 0 || (schema?.numericRules?.length ?? 0) > 0;
        if (!hasRules) continue;
        providers.push(new SchemaLedgerProvider(moduleId, schema, deps));
        if (schema.numericRules?.length) providers.push(new NumericRuleProvider(moduleId, schema, deps));
    }
    return providers;
}

/** 契约自检（测试用）：有提醒/阈值规则的模块都有对应 provider */
export function providerCoverage(
    schemaCatalog: Record<string, ModuleSchema>,
    providers: DataProvider[],
): string[] {
    const ids = new Set(providers.map((p) => p.moduleId));
    const missing: string[] = [];
    for (const [moduleId, schema] of Object.entries(schemaCatalog)) {
        const needs = (schema?.reminders?.length ?? 0) > 0 || (schema?.numericRules?.length ?? 0) > 0;
        if (needs && !ids.has(moduleId)) missing.push(moduleId);
    }
    return missing;
}
