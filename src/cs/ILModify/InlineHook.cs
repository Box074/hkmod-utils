
public static partial class Program
{
    public static int id = 0;
    public static Dictionary<string, TypeReference> delegateMap = new();
    public static void TryCheckIH(Instruction il, MethodDefinition md)
    {
        if (!inlineHook) return;
        if (il.Operand is MethodReference mr)
        {
            if (!mr.DeclaringType.FullName.StartsWith("On.") && !mr.DeclaringType.FullName.StartsWith("IL.")) return;

            mr.DeclaringType = ConvertHookDelegate(mr.DeclaringType, md.Module, out var repalced);
            if (repalced)
            {
                il.Operand = mr.DeclaringType.Resolve().Methods.First(x => x.Name == mr.Name);
                return;
            }
            if (mr.Name.StartsWith("add_") || mr.Name.StartsWith("remove_")) CheckIH(mr, il, md);
        }
    }
    public static void CheckIH(MethodReference mr, Instruction il, MethodDefinition md)
    {
        if (!inlineHook) return;

        var rmd = mr.Resolve();
        if (rmd?.Body == null) return;
        var compilerHelper = FindType(CompilerHelperFullName, md.Module);

        var method = (MethodReference)rmd.Body.Instructions.First(x => x.OpCode == OpCodes.Ldtoken).Operand;
        var callMethod = (MethodReference)rmd.Body.Instructions.First(x => x.Operand is MethodReference and
        {
            DeclaringType.FullName: "MonoMod.RuntimeDetour.HookGen.HookEndpointManager"
        }).Operand;
        var helperMethod = "Hook_" + callMethod.Name;
        il.OpCode = OpCodes.Ldtoken;
        il.Operand = md.Module.ImportReference(method);
        if(!method.Resolve().HasBody)
        {
            throw new NotSupportedException($"Body-less method {mr.FullName}");
        }
        md.Body.GetILProcessor().InsertAfter(il,
            Instruction.Create(OpCodes.Call, md.Module.ImportReference(compilerHelper.Methods.First(x => x.Name == helperMethod))));
    }
    public static TypeReference ConvertHookDelegate(TypeReference tr, ModuleDefinition md, out bool replaced)
    {
        replaced = false;
        tr = md.ImportReference(tr);
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
        var rt = GenerateDelegate(invoke, md);
        delegateMap.Add(tr.FullName, rt);
        replaced = true;
        return rt;
    }
    public static TypeDefinition GenerateDelegate(MethodDefinition invokeMethod, ModuleDefinition md)
    {
        TypeDefinition del = new TypeDefinition(
            null, "MD_" + (id++),
            TypeAttributes.NotPublic | TypeAttributes.Sealed | TypeAttributes.Class,
            md.ImportReference(FindType("System.MulticastDelegate", md))
        );
        MethodDefinition ctor = new MethodDefinition(
            ".ctor",
            MethodAttributes.Public | MethodAttributes.HideBySig | MethodAttributes.SpecialName | MethodAttributes.RTSpecialName | MethodAttributes.ReuseSlot,
            md.TypeSystem.Void
        )
        {
            ImplAttributes = MethodImplAttributes.Runtime | MethodImplAttributes.Managed,
            HasThis = true
        };
        ctor.Parameters.Add(new ParameterDefinition(md.TypeSystem.Object));
        ctor.Parameters.Add(new ParameterDefinition(md.TypeSystem.IntPtr));
        ctor.Body = new MethodBody(ctor);
        del.Methods.Add(ctor);

        MethodDefinition invoke = new MethodDefinition(
            "Invoke",
            MethodAttributes.Public | MethodAttributes.Virtual | MethodAttributes.HideBySig | MethodAttributes.NewSlot,
            ConvertHookDelegate(invokeMethod.ReturnType, md, out _)
        )
        {
            ImplAttributes = MethodImplAttributes.Runtime | MethodImplAttributes.Managed,
            HasThis = true
        };
        foreach (ParameterDefinition param in invokeMethod.Parameters)
            invoke.Parameters.Add(new ParameterDefinition(
                param.Name,
                param.Attributes,
                ConvertHookDelegate(param.ParameterType, md, out _)
            ));
        invoke.Body = new MethodBody(invoke);
        del.Methods.Add(invoke);

        MethodDefinition invokeBegin = new MethodDefinition(
            "BeginInvoke",
            MethodAttributes.Public | MethodAttributes.Virtual | MethodAttributes.HideBySig | MethodAttributes.NewSlot,
            md.ImportReference(FindType("System.IAsyncResult", md))
        )
        {
            ImplAttributes = MethodImplAttributes.Runtime | MethodImplAttributes.Managed,
            HasThis = true
        };
        foreach (ParameterDefinition param in invoke.Parameters)
            invokeBegin.Parameters.Add(new ParameterDefinition(param.Name, param.Attributes, ConvertHookDelegate(param.ParameterType, md, out _)));
        invokeBegin.Parameters.Add(new ParameterDefinition("callback", ParameterAttributes.None, md.ImportReference(FindType("System.AsyncCallback", md))));
        invokeBegin.Parameters.Add(new ParameterDefinition(null, ParameterAttributes.None, md.TypeSystem.Object));
        invokeBegin.Body = new MethodBody(invokeBegin);
        del.Methods.Add(invokeBegin);

        MethodDefinition invokeEnd = new MethodDefinition(
            "EndInvoke",
            MethodAttributes.Public | MethodAttributes.Virtual | MethodAttributes.HideBySig | MethodAttributes.NewSlot,
            md.TypeSystem.Object
        )
        {
            ImplAttributes = MethodImplAttributes.Runtime | MethodImplAttributes.Managed,
            HasThis = true
        };
        invokeEnd.Parameters.Add(new ParameterDefinition("result", ParameterAttributes.None, md.ImportReference(FindType("System.IAsyncResult", md))));
        invokeEnd.Body = new MethodBody(invokeEnd);
        del.Methods.Add(invokeEnd);

        md.Types.Add(del);
        return del;
    }
}
