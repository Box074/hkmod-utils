
public static partial class Program
{
    public static Dictionary<string, TypeReference> delegateMap = new();
    public static void TryCheckIH(Instruction il, MethodDefinition md)
    {
        if (!inlineHook) return;
        if (il.Operand is MethodReference mr)
        {
            if (!mr.DeclaringType.FullName.StartsWith("On.") && !mr.DeclaringType.FullName.StartsWith("IL.")) return;

            mr.DeclaringType = ConvertHookDelegate(mr.DeclaringType, md.Module, out var repalced);
            
            if(mr.Name == "Invoke" && repalced)
            {
                // throw new Exception(mr.FullName);
                for(int i = 0; i < mr.Parameters.Count; i++)
                {
                    mr.Parameters[i].Name = "arg" + i;
                    mr.Parameters[i].ParameterType = mr.DeclaringType.Resolve().GenericParameters[i];
                }
                if(mr.DeclaringType.FullName.StartsWith("System.Func"))
                {
                    mr.ReturnType = mr.DeclaringType.Resolve().GenericParameters[mr.DeclaringType.Resolve().GenericParameters.Count - 1];
                    //mr.ReturnType = md.Module.TypeSystem.Void;
                }
            }
            
            il.Operand = md.Module.ImportReference(mr);
            if(mr.Name != ".ctor") CheckIH(mr, il, md);
        }
    }
    public static void CheckIH(MethodReference mr, Instruction il, MethodDefinition md)
    {
        if (!inlineHook) return;
        var rmd = mr.Resolve();
        if (rmd?.Body == null) return;
        var ass = rmd.Module.Assembly;
        if (!ass.Name.Name.StartsWith("MMHOOK_")) return;

        var compilerHelper = FindType(CompilerHelperFullName, md.Module);

        var method = (MethodReference)rmd.Body.Instructions.First(x => x.OpCode == OpCodes.Ldtoken).Operand;
        var callMethod = (MethodReference)rmd.Body.Instructions.First(x => x.Operand is MethodReference and
        {
            DeclaringType.FullName: "MonoMod.RuntimeDetour.HookGen.HookEndpointManager"
        }).Operand;
        var helperMethod = "Hook_" + callMethod.Name;
        il.OpCode = OpCodes.Ldtoken;
        il.Operand = md.Module.ImportReference(method);
        md.Body.GetILProcessor().InsertAfter(il,
            Instruction.Create(OpCodes.Call, md.Module.ImportReference(compilerHelper.Methods.First(x => x.Name == helperMethod))));
    }
    public static TypeReference ConvertHookDelegate(TypeReference tr, ModuleDefinition md, out bool replaced)
    {
        replaced = false;
        if (!inlineHook) return tr;
        if (!tr.FullName.StartsWith("On")) return tr;
        var td = tr.Resolve();


        if (td.BaseType.FullName != "System.MulticastDelegate") return tr;
        if (delegateMap.TryGetValue(tr.FullName, out var val))
        {
            replaced = true;
            return val;
        }


        var invoke = td.Methods.First(x => x.Name == "Invoke");
        GenericInstanceType t;
        if (invoke.ReturnType.FullName == "System.Void")
        {
            t = new GenericInstanceType(FindType("System.Action`" + invoke.Parameters.Count, md));
            foreach (var v in invoke.Parameters)
            {
                t.GenericArguments.Add(md.ImportReference(ConvertHookDelegate(v.ParameterType, md, out _)));
            }
        }
        else
        {
            t = new GenericInstanceType(FindType("System.Func`" + (invoke.Parameters.Count + 1), md));
            foreach (var v in invoke.Parameters)
            {
                t.GenericArguments.Add(md.ImportReference(ConvertHookDelegate(v.ParameterType, md, out _)));
            }
            t.GenericArguments.Add(md.ImportReference(ConvertHookDelegate(invoke.ReturnType, md, out _)));
        }
        delegateMap.Add(tr.FullName, t);
        replaced = true;
        return t;
    }
}
