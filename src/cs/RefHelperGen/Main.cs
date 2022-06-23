
public static partial class Program
{
    public const string CompilerHelperFullName = "HKTool.Runtime.CompilerHelper";
    private class AssemblyResolver : IAssemblyResolver
    {
        public AssemblyResolver(string[] assemblys, string ignore)
        {
            foreach (var v in assemblys)
            {
                try
                {
                    if (v == ignore) continue;
                    var bytes = File.ReadAllBytes(v);
                    var ass = AssemblyDefinition.ReadAssembly(new MemoryStream(bytes), new ReaderParameters()
                    {
                        AssemblyResolver = new AssemblyResolver()
                    });
                    assemblyMap.Add(ass.Name.Name, ass);
                    Console.Error.WriteLine(ass.FullName);
                }
                catch (Exception)
                {

                }
            }
        }
        public AssemblyResolver()
        {

        }
        public static Dictionary<string, AssemblyDefinition> assemblyMap = new();
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        AssemblyDefinition IAssemblyResolver.Resolve(AssemblyNameReference name, ReaderParameters rp)
        {
            if (assemblyMap.TryGetValue(name.Name, out var v)) return v;
            return null;
        }
        void IDisposable.Dispose()
        {
            foreach (var v in assemblyMap.Values) v.Dispose();
        }
    }
    public static bool IsCanAccess(MemberReference mr)
    {
        if (mr is null) return true;
        var md = mr.Resolve();
        if (md is TypeDefinition td)
        {
            var b0 = (td.IsPublic || td.IsNestedPublic) & IsCanAccess(td.DeclaringType);
            if(mr is GenericInstanceType gt) b0 = b0 & gt.GenericArguments.All(x => IsCanAccess(x));
            return b0;
        }
        if (md is FieldDefinition fd) return fd.IsPublic & IsCanAccess(fd.DeclaringType);
        if (md is MethodDefinition md0) return md0.IsPublic & IsCanAccess(md0.DeclaringType);
        return true;
    }
    static MethodBase ExtensionAttributeCtor = typeof(System.Runtime.CompilerServices.ExtensionAttribute).GetConstructors()[0];
    static AssemblyNameReference hktoolR = null;
    static CustomAttribute GetCustomInPatcher(ModuleDefinition module, string name)
    {
        if (hktoolR == null)
        {
            hktoolR = new("HKTool", new());
            module.AssemblyReferences.Add(hktoolR);
        }
        var attrCtor = new MethodReference(".ctor", module.TypeSystem.Void, new("HKTool.Patcher", "PatchCallerAttribute", module, hktoolR));
        attrCtor.Parameters.Add(new(module.ImportReference(typeof(Type))));
        attrCtor.Parameters.Add(new(module.TypeSystem.String));
        var attr = new CustomAttribute(
            module.ImportReference(attrCtor)
            );
        attr.ConstructorArguments.Add(new(module.ImportReference(typeof(Type)), module.ImportReference(
            new TypeReference("HKTool.Utils.Compile", "InternalPatcher", module, hktoolR)
        )));
        attr.ConstructorArguments.Add(new(module.TypeSystem.String, name));
        return attr;
    }
    public static string GetFriendlyName(string orig) => orig.Replace('<', '_')
                                                           .Replace('>', '_')
                                                           .Replace(' ', '_')
                                                           .Replace('.', '_')
                                                           .Replace('$', '_')
                                                           .Replace('/', '_')
                                                           .Replace('+', '_');
    static void GenType(out TypeDefinition instanceType, out TypeDefinition staticType, TypeDefinition type, ModuleDefinition module)
    {
        instanceType = new(type.GetRootType().Namespace, "Instance_" + GetFriendlyName(type.Name), TypeAttributes.Public | TypeAttributes.Sealed);
        instanceType.BaseType = module.TypeSystem.Object;
        instanceType.IsAbstract = true;
        instanceType.CustomAttributes.Add(new(module.ImportReference(ExtensionAttributeCtor)));

        staticType = new(type.GetRootType().Namespace, "Static" + type.Name, TypeAttributes.Public | TypeAttributes.Sealed);
        staticType.BaseType = module.TypeSystem.Object;
        staticType.IsAbstract = true;
        staticType.CustomAttributes.Add(new(module.ImportReference(ExtensionAttributeCtor)));
    }
    static TypeDefinition GetRootType(this TypeDefinition type)
    {
        if (type.DeclaringType == null) return type;
        return type.DeclaringType.GetRootType();
    }
    static bool CreateType(TypeDefinition type, ModuleDefinition module, TypeDefinition parent)
    {
        if (!IsCanAccess(type) || type.HasGenericParameters || type.IsInterface) return false;
        var privateFields = type.Fields.Where(x => !IsCanAccess(x) & (IsCanAccess(x.DeclaringType) || !x.FieldType.IsValueType)).ToArray();
        var privateMethods = type.Methods.Where(x => (!IsCanAccess(x) || x.IsVirtual) & !x.HasGenericParameters).ToArray();
        GenType(out var instanceType, out var staticType, type, module);
        bool useInstance = false;
        bool useStatic = false;

        if (privateFields.Length > 0 || privateMethods.Length > 0)
        {
            foreach (var method in privateMethods)
            {
                var method0 = new MethodDefinition((method.IsVirtual ? "direct_" : "") + GetFriendlyName(method.Name), MethodAttributes.Public, module.ImportReference(method.ReturnType));
                method0.IsStatic = true;
                method0.CustomAttributes.Add(GetCustomInPatcher(module, "Patch_PrivateMethodCaller"));
                
                if (!method.IsStatic)
                {
                    useInstance = true;
                    method0.Parameters.Add(new(module.ImportReference(method.DeclaringType)));
                    method0.CustomAttributes.Add(new(module.ImportReference(ExtensionAttributeCtor)));
                    instanceType.Methods.Add(method0);
                }
                else
                {
                    useStatic = true;
                    staticType.Methods.Add(method0);
                }
                foreach (var v in method.Parameters)
                {
                    method0.Parameters.Add(new(module.ImportReference(v.ParameterType)));
                }
                var body = method0.Body = new(method0);

                var il = body.GetILProcessor();
                il.Emit(OpCodes.Ldtoken, module.ImportReference(method));
                if (method.ReturnType.FullName == "System.Void") il.Emit(OpCodes.Pop);
                il.Emit(OpCodes.Ret);

            }
            foreach (var field in privateFields)
            {
                var t = field.FieldType;
                if (!IsCanAccess(t))
                {
                    if (t.IsValueType) continue;
                    t = module.TypeSystem.Object;
                }
                t = new ByReferenceType(t);

                var method = new MethodDefinition("private_" + GetFriendlyName(field.Name), MethodAttributes.Public, t);
                method.IsStatic = true;
                method.CustomAttributes.Add(GetCustomInPatcher(module, "Patch_RefHelperEx"));
                if (!field.IsStatic)
                {
                    useInstance = true;
                    method.Parameters.Add(new("self", ParameterAttributes.None, module.ImportReference(type)));
                    method.CustomAttributes.Add(new(module.ImportReference(ExtensionAttributeCtor)));
                }
                else
                {
                    useStatic = true;
                }
                method.ReturnType = module.ImportReference(t);
                var body = method.Body = new(method);
                var il = body.GetILProcessor();
                il.Emit(OpCodes.Ldtoken, module.ImportReference(field));
                il.Emit(OpCodes.Ret);

                if (field.IsStatic)
                {
                    staticType.Methods.Add(method);
                }
                else
                {
                    instanceType.Methods.Add(method);
                }
            }
        }
        foreach (var t in type.NestedTypes)
        {
            if (!IsCanAccess(t)) continue;
            useStatic = useStatic || CreateType(t, module, staticType);
        }
        if (useStatic)
        {
            if (parent == null)
            {
                module.Types.Add(staticType);
            }
            else
            {
                parent.NestedTypes.Add(staticType);
            }
        }
        if (useInstance) module.Types.Add(instanceType);
        return useInstance || useStatic;
    }
    static void Main(string[] args)
    {
        using (var ar = new AssemblyResolver(args.Skip(1).ToArray(), ""))
        {
            using (var nasm = AssemblyDefinition.CreateAssembly(new("HKToolRefHelper", new()), "HKToolRefHelper", ModuleKind.Dll))
            {
                foreach ((string name, AssemblyDefinition ass) in AssemblyResolver.assemblyMap)
                {
                    foreach (var type in ass.MainModule.Types)
                    {
                        CreateType(type, nasm.MainModule, null);
                    }
                }
                nasm.Write(args[0]);
            }
        }
    }

}


